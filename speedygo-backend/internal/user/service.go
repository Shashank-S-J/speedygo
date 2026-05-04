package user

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/speedygo/speedygo/internal/config"
	apperr "github.com/speedygo/speedygo/internal/errors"
	"github.com/speedygo/speedygo/internal/middleware"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/speedygo/speedygo/internal/otp"
	"golang.org/x/crypto/bcrypt"
)

// Service handles user business logic.
type Service struct {
	repo *Repository
	cfg  *config.Config
	log  *slog.Logger
	rdb  *redis.Client
	otp  *otp.Service
}

func NewService(repo *Repository, cfg *config.Config, rdb *redis.Client, otpSvc *otp.Service, log *slog.Logger) *Service {
	return &Service{repo: repo, cfg: cfg, log: log, rdb: rdb, otp: otpSvc}
}

type RegisterRequest struct {
	Email    string          `json:"email" validate:"required,email"`
	Phone    string          `json:"phone" validate:"required"`
	Password string          `json:"password" validate:"required,min=8"`
	FullName string          `json:"full_name" validate:"required"`
	Role     models.UserRole `json:"role" validate:"required,oneof=CUSTOMER TRANSPORTER"`
}

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password"`
	// OTP-based login: if login_method is "otp", password is not required
	LoginMethod string `json:"login_method"` // "password" or "otp"
	OTP         string `json:"otp"`
}

type AuthResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	User         UserResponse `json:"user"`
}

type UserResponse struct {
	ID                uint              `json:"id"`
	Email             string            `json:"email"`
	Phone             string            `json:"phone"`
	FullName          string            `json:"full_name"`
	Role              models.UserRole   `json:"role"`
	Status            models.UserStatus `json:"status"`
	Photo             string            `json:"profile_photo,omitempty"`
	AvatarConfig      json.RawMessage   `json:"avatar_config,omitempty"`
	FraudScore        float64           `json:"fraud_score"`
	WarningCount      int               `json:"warning_count"`
	CancellationCount int               `json:"cancellation_count"`
	IsAvailable       bool              `json:"is_available"`
	AvgRating         *float64          `json:"avg_rating,omitempty"`
	TotalRatings      int               `json:"total_ratings"`
	CreatedAt         time.Time         `json:"created_at"`
	LastLoginAt       *time.Time        `json:"last_login_at,omitempty"`
}

func toUserResponse(u *models.User) UserResponse {
	return UserResponse{
		ID: u.ID, Email: u.Email, Phone: u.Phone,
		FullName: u.FullName, Role: u.Role, Status: u.Status,
		Photo: u.ProfilePhoto, AvatarConfig: json.RawMessage(u.AvatarConfig),
		FraudScore: u.FraudScore,
		WarningCount: u.WarningCount, CancellationCount: u.CancellationCount,
		IsAvailable: u.IsAvailable, AvgRating: u.AvgRating, TotalRatings: u.TotalRatings,
		CreatedAt: u.CreatedAt, LastLoginAt: u.LastLoginAt,
	}
}

// checkLoginLockout implements progressive lockout via Redis.
// 5 failures → 15min, 10 failures → 24h lockout.
func (s *Service) checkLoginLockout(email, ip string) error {
	if s.rdb == nil {
		return nil
	}
	ctx := context.Background()

	// Check if locked out
	lockKey := fmt.Sprintf("login:lock:%s", email)
	if ttl, _ := s.rdb.TTL(ctx, lockKey).Result(); ttl > 0 {
		return apperr.TooManyRequests(fmt.Sprintf("Account locked. Try again in %d minutes", int(ttl.Minutes())+1))
	}

	return nil
}

func (s *Service) recordLoginAttempt(email, ip, userAgent string, success bool) {
	// Record in DB for audit
	s.repo.db.Create(&models.LoginAttempt{
		Email:     email,
		IP:        ip,
		UserAgent: userAgent,
		Success:   success,
	})

	if s.rdb == nil {
		return
	}
	if success {
		// Clear failure counter on success
		ctx := context.Background()
		s.rdb.Del(ctx, fmt.Sprintf("login:fails:%s", email))
		return
	}

	ctx := context.Background()
	failKey := fmt.Sprintf("login:fails:%s", email)
	failures, _ := s.rdb.Incr(ctx, failKey).Result()
	s.rdb.Expire(ctx, failKey, 24*time.Hour)

	lockKey := fmt.Sprintf("login:lock:%s", email)
	switch {
	case failures >= 10:
		s.rdb.Set(ctx, lockKey, "1", 24*time.Hour)
		s.log.Warn("account locked 24h", "email", email, "failures", failures)
	case failures >= 5:
		s.rdb.Set(ctx, lockKey, "1", 15*time.Minute)
		s.log.Warn("account locked 15min", "email", email, "failures", failures)
	}
}

func (s *Service) Register(req RegisterRequest) (*RegisterOTPResponse, error) {
	// Only allow CUSTOMER and TRANSPORTER roles for self-registration
	if req.Role != models.RoleCustomer && req.Role != models.RoleTransporter {
		return nil, apperr.BadRequest("Invalid role. Only CUSTOMER and TRANSPORTER are allowed")
	}

	if len(req.Password) < 8 {
		return nil, apperr.BadRequest("Password must be at least 8 characters")
	}

	// Check existing email
	if existing, _ := s.repo.FindByEmail(req.Email); existing.ID != 0 {
		return nil, apperr.Conflict("Email already registered")
	}
	// Check existing phone
	if existing, _ := s.repo.FindByPhone(req.Phone); existing.ID != 0 {
		return nil, apperr.Conflict("Phone already registered")
	}

	// Hash password before storing temporarily
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		return nil, apperr.Internal("Failed to hash password", err)
	}

	// Store registration data temporarily in Redis (awaiting OTP)
	regData, _ := json.Marshal(map[string]string{
		"email":         req.Email,
		"phone":         req.Phone,
		"full_name":     req.FullName,
		"role":          string(req.Role),
		"password_hash": string(hash),
	})

	ctx := context.Background()
	if s.otp != nil {
		if err := s.otp.StoreRegistrationData(ctx, req.Email, regData); err != nil {
			return nil, apperr.Internal("Failed to initiate registration", err)
		}
		if err := s.otp.SendOTP(ctx, req.Email, otp.PurposeRegistration); err != nil {
			return nil, apperr.BadRequest(err.Error())
		}
		return &RegisterOTPResponse{
			Message:     "OTP sent to your email. Verify to complete registration.",
			Email:       req.Email,
			OTPRequired: true,
		}, nil
	}

	// Fallback: no OTP service (dev mode) — create account directly
	return s.createUserDirectly(req.Email, req.Phone, req.FullName, req.Role, string(hash))
}

type RegisterOTPResponse struct {
	Message     string `json:"message"`
	Email       string `json:"email"`
	OTPRequired bool   `json:"otp_required"`
	// Only populated when OTP is skipped (dev mode)
	*AuthResponse `json:"auth,omitempty"`
}

type VerifyOTPRequest struct {
	Email string `json:"email"`
	OTP   string `json:"otp"`
}

func (s *Service) VerifyRegistrationOTP(req VerifyOTPRequest) (*AuthResponse, error) {
	if req.Email == "" || req.OTP == "" {
		return nil, apperr.BadRequest("Email and OTP are required")
	}

	ctx := context.Background()

	// Verify OTP
	if s.otp == nil {
		return nil, apperr.Internal("OTP service unavailable", nil)
	}
	if err := s.otp.VerifyOTP(ctx, req.Email, otp.PurposeRegistration, req.OTP); err != nil {
		return nil, apperr.BadRequest(err.Error())
	}

	// Retrieve stored registration data
	data, err := s.otp.GetRegistrationData(ctx, req.Email)
	if err != nil {
		return nil, apperr.BadRequest("Registration data expired. Please register again.")
	}

	var regData map[string]string
	if err := json.Unmarshal(data, &regData); err != nil {
		return nil, apperr.Internal("Failed to parse registration data", err)
	}

	// Double-check email/phone not taken (race condition protection)
	if existing, _ := s.repo.FindByEmail(regData["email"]); existing.ID != 0 {
		return nil, apperr.Conflict("Email already registered")
	}
	if existing, _ := s.repo.FindByPhone(regData["phone"]); existing.ID != 0 {
		return nil, apperr.Conflict("Phone already registered")
	}

	resp, err := s.createUserDirectly(
		regData["email"], regData["phone"], regData["full_name"],
		models.UserRole(regData["role"]), regData["password_hash"],
	)
	if err != nil {
		return nil, err
	}

	s.otp.ClearRegistrationData(ctx, req.Email)
	return resp.AuthResponse, nil
}

func (s *Service) ResendRegistrationOTP(email string) error {
	if s.otp == nil {
		return apperr.Internal("OTP service unavailable", nil)
	}
	ctx := context.Background()
	// Check that registration data exists
	if _, err := s.otp.GetRegistrationData(ctx, email); err != nil {
		return apperr.BadRequest("No pending registration found for this email. Please register first.")
	}
	if err := s.otp.SendOTP(ctx, email, otp.PurposeRegistration); err != nil {
		return apperr.BadRequest(err.Error())
	}
	return nil
}

func (s *Service) createUserDirectly(email, phone, fullName string, role models.UserRole, passwordHash string) (*RegisterOTPResponse, error) {
	user := &models.User{
		Email:        email,
		Phone:        phone,
		PasswordHash: passwordHash,
		FullName:     fullName,
		Role:         role,
		Status:       models.StatusPendingKYC,
	}

	if err := s.repo.Create(user); err != nil {
		return nil, apperr.Internal("Failed to create user", err)
	}

	auth, err := s.generateTokens(user)
	if err != nil {
		return nil, err
	}
	return &RegisterOTPResponse{
		Message:      "Registration successful",
		Email:        email,
		OTPRequired:  false,
		AuthResponse: auth,
	}, nil
}

func (s *Service) Login(req LoginRequest, ip, userAgent string) (*AuthResponse, error) {
	// Check lockout first
	if err := s.checkLoginLockout(req.Email, ip); err != nil {
		return nil, err
	}

	// OTP-based login
	if req.LoginMethod == "otp" {
		if req.OTP == "" {
			return nil, apperr.BadRequest("OTP is required for OTP login")
		}
		return s.LoginWithOTP(req.Email, req.OTP, ip, userAgent)
	}

	// Password-based login
	if req.Password == "" {
		return nil, apperr.BadRequest("Password is required")
	}

	user, err := s.repo.FindByEmail(req.Email)
	if err != nil || user.ID == 0 {
		s.recordLoginAttempt(req.Email, ip, userAgent, false)
		return nil, apperr.Unauthorized("Invalid email or password")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		s.recordLoginAttempt(req.Email, ip, userAgent, false)
		return nil, apperr.Unauthorized("Invalid email or password")
	}

	if user.Status == models.StatusBanned {
		return nil, apperr.Forbidden("Account has been permanently banned")
	}
	if user.Status == models.StatusSuspended {
		return nil, apperr.Forbidden(fmt.Sprintf("Account suspended: %s", user.SuspendReason))
	}

	// Record successful login
	s.recordLoginAttempt(req.Email, ip, userAgent, true)

	now := time.Now()
	user.LastLoginAt = &now
	user.LastLoginIP = ip

	// Store device fingerprint (hash of UA + IP prefix for privacy)
	fingerprint := fmt.Sprintf("%x", sha256.Sum256([]byte(userAgent+ip[:min(len(ip), 12)])))
	user.DeviceFingerprint = fingerprint[:32]

	s.repo.Update(user)

	return s.generateTokens(user)
}

func (s *Service) GetProfile(userID uint) (*UserResponse, error) {
	// Check Redis cache first
	if s.rdb != nil {
		ctx := context.Background()
		cacheKey := fmt.Sprintf("user:profile:%d", userID)
		if cached, err := s.rdb.Get(ctx, cacheKey).Result(); err == nil {
			var resp UserResponse
			if json.Unmarshal([]byte(cached), &resp) == nil {
				return &resp, nil
			}
		}
	}

	user, err := s.repo.FindByID(userID)
	if err != nil {
		return nil, apperr.NotFound("User not found")
	}
	resp := toUserResponse(user)

	// Cache profile for 5 minutes
	if s.rdb != nil {
		ctx := context.Background()
		cacheKey := fmt.Sprintf("user:profile:%d", userID)
		data, _ := json.Marshal(resp)
		s.rdb.Set(ctx, cacheKey, data, 5*time.Minute)
	}

	return &resp, nil
}

type UpdateProfileRequest struct {
	FullName     string          `json:"full_name"`
	Phone        string          `json:"phone"`
	Photo        string          `json:"profile_photo"`
	FCMToken     string          `json:"fcm_token"`
	AvatarConfig json.RawMessage `json:"avatar_config"`
}

func (s *Service) UpdateProfile(userID uint, req UpdateProfileRequest) (*UserResponse, error) {
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return nil, apperr.NotFound("User not found")
	}
	// Block suspended/banned users from updating profile
	if user.Status == models.StatusSuspended || user.Status == models.StatusBanned {
		return nil, apperr.Forbidden("Cannot update profile while account is suspended or banned")
	}
	if req.FullName != "" {
		user.FullName = req.FullName
	}
	if req.Phone != "" && req.Phone != user.Phone {
		// Check phone uniqueness
		if existing, _ := s.repo.FindByPhone(req.Phone); existing.ID != 0 && existing.ID != userID {
			return nil, apperr.Conflict("Phone number already in use")
		}
		user.Phone = req.Phone
	}
	if req.Photo != "" {
		user.ProfilePhoto = req.Photo
	}
	if req.FCMToken != "" {
		user.FCMToken = req.FCMToken
	}
	if len(req.AvatarConfig) > 0 && string(req.AvatarConfig) != "null" {
		user.AvatarConfig = []byte(req.AvatarConfig)
	}
	if err := s.repo.Update(user); err != nil {
		return nil, apperr.Internal("Failed to update profile", err)
	}

	// Invalidate profile cache
	s.invalidateProfileCache(userID)

	resp := toUserResponse(user)
	return &resp, nil
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type ResetPasswordRequest struct {
	Email       string `json:"email"`
	OTP         string `json:"otp"`
	NewPassword string `json:"new_password"`
}

func (s *Service) ChangePassword(userID uint, req ChangePasswordRequest) error {
	if len(req.NewPassword) < 8 {
		return apperr.BadRequest("New password must be at least 8 characters")
	}
	if req.CurrentPassword == req.NewPassword {
		return apperr.BadRequest("New password must be different from current password")
	}

	user, err := s.repo.FindByID(userID)
	if err != nil {
		return apperr.NotFound("User not found")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		return apperr.Unauthorized("Current password is incorrect")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), 12)
	if err != nil {
		return apperr.Internal("Failed to hash password", err)
	}

	user.PasswordHash = string(hash)
	if err := s.repo.Update(user); err != nil {
		return err
	}

	// Invalidate all active sessions after password change
	s.revokeAllSessions(userID, 24*time.Hour)

	return nil
}

// ForgotPassword sends a password reset OTP to the user's email.
// Always returns success to prevent email enumeration attacks.
func (s *Service) ForgotPassword(email string) error {
	if s.otp == nil {
		return apperr.Internal("OTP service unavailable", nil)
	}

	// Check if user exists — but always return ok to prevent enumeration
	user, err := s.repo.FindByEmail(email)
	if err != nil || user.ID == 0 {
		// Silent success — don't reveal if email exists
		s.log.Info("forgot password for non-existent email", "email", email)
		return nil
	}

	if user.Status == models.StatusBanned {
		return nil // Don't send OTP to banned accounts
	}

	ctx := context.Background()
	if err := s.otp.SendOTP(ctx, email, otp.PurposePasswordReset); err != nil {
		s.log.Error("failed to send password reset OTP", "email", email, "error", err)
		return nil // Silent fail
	}

	return nil
}

// ResetPassword verifies the OTP and sets a new password.
func (s *Service) ResetPassword(req ResetPasswordRequest) error {
	if len(req.NewPassword) < 8 {
		return apperr.BadRequest("Password must be at least 8 characters")
	}

	if s.otp == nil {
		return apperr.Internal("OTP service unavailable", nil)
	}

	ctx := context.Background()
	if err := s.otp.VerifyOTP(ctx, req.Email, otp.PurposePasswordReset, req.OTP); err != nil {
		return apperr.BadRequest("Invalid or expired OTP")
	}

	user, err := s.repo.FindByEmail(req.Email)
	if err != nil || user.ID == 0 {
		return apperr.BadRequest("Invalid email")
	}

	if user.Status == models.StatusBanned {
		return apperr.Forbidden("Account has been permanently banned")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), 12)
	if err != nil {
		return apperr.Internal("Failed to hash password", err)
	}

	user.PasswordHash = string(hash)
	if err := s.repo.Update(user); err != nil {
		return apperr.Internal("Failed to update password", err)
	}

	// Revoke all existing sessions after password reset
	s.revokeAllSessions(user.ID, 24*time.Hour)

	// Clear any login lockouts
	if s.rdb != nil {
		s.rdb.Del(ctx, fmt.Sprintf("login:lock:%s", req.Email))
		s.rdb.Del(ctx, fmt.Sprintf("login:fails:%s", req.Email))
	}

	return nil
}


// SendLoginOTP sends an OTP for passwordless login.
func (s *Service) SendLoginOTP(email string) error {
	if s.otp == nil {
		return apperr.Internal("OTP service unavailable", nil)
	}

	user, err := s.repo.FindByEmail(email)
	if err != nil || user.ID == 0 {
		// Silent success to prevent enumeration
		s.log.Info("login OTP for non-existent email", "email", email)
		return nil
	}
	if user.Status == models.StatusBanned {
		return nil
	}

	ctx := context.Background()
	if err := s.otp.SendOTP(ctx, email, otp.PurposeLogin); err != nil {
		s.log.Error("failed to send login OTP", "email", email, "error", err)
		return nil
	}
	return nil
}

// LoginWithOTP verifies OTP and logs in without password.
func (s *Service) LoginWithOTP(email, code, ip, userAgent string) (*AuthResponse, error) {
	if s.otp == nil {
		return nil, apperr.Internal("OTP service unavailable", nil)
	}

	user, err := s.repo.FindByEmail(email)
	if err != nil || user.ID == 0 {
		return nil, apperr.Unauthorized("Invalid email or OTP")
	}
	if user.Status == models.StatusBanned {
		return nil, apperr.Forbidden("Account has been permanently banned")
	}
	if user.Status == models.StatusSuspended {
		return nil, apperr.Forbidden(fmt.Sprintf("Account suspended: %s", user.SuspendReason))
	}

	ctx := context.Background()
	if err := s.otp.VerifyOTP(ctx, email, otp.PurposeLogin, code); err != nil {
		return nil, apperr.Unauthorized("Invalid or expired OTP")
	}

	s.recordLoginAttempt(email, ip, userAgent, true)
	now := time.Now()
	user.LastLoginAt = &now
	user.LastLoginIP = ip
	fingerprint := fmt.Sprintf("%x", sha256.Sum256([]byte(userAgent+ip[:min(len(ip), 12)])))
	user.DeviceFingerprint = fingerprint[:32]
	s.repo.Update(user)

	return s.generateTokens(user)
}

// SendChangePasswordOTP sends OTP for password change verification.
func (s *Service) SendChangePasswordOTP(userID uint) error {
	if s.otp == nil {
		return apperr.Internal("OTP service unavailable", nil)
	}
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return apperr.NotFound("User not found")
	}
	ctx := context.Background()
	return s.otp.SendOTP(ctx, user.Email, otp.PurposePasswordReset)
}

// ChangePasswordWithOTP verifies OTP then changes password.
func (s *Service) ChangePasswordWithOTP(userID uint, otpCode, newPassword string) error {
	if len(newPassword) < 8 {
		return apperr.BadRequest("New password must be at least 8 characters")
	}
	if s.otp == nil {
		return apperr.Internal("OTP service unavailable", nil)
	}

	user, err := s.repo.FindByID(userID)
	if err != nil {
		return apperr.NotFound("User not found")
	}

	ctx := context.Background()
	if err := s.otp.VerifyOTP(ctx, user.Email, otp.PurposePasswordReset, otpCode); err != nil {
		return apperr.BadRequest("Invalid or expired OTP")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), 12)
	if err != nil {
		return apperr.Internal("Failed to hash password", err)
	}
	user.PasswordHash = string(hash)
	if err := s.repo.Update(user); err != nil {
		return err
	}

	// Revoke all existing sessions after OTP-based password change
	s.revokeAllSessions(userID, 24*time.Hour)

	return nil
}

func (s *Service) generateTokens(user *models.User) (*AuthResponse, error) {
	accessToken, err := middleware.GenerateAccessToken(
		s.cfg.JWT.Secret, user, s.cfg.JWT.AccessTokenTTL,
	)
	if err != nil {
		return nil, apperr.Internal("Failed to generate access token", err)
	}

	// Create a new token family for this login session
	familyID := uuid.New().String()

	refreshToken, err := middleware.GenerateRefreshToken(
		s.cfg.JWT.RefreshSecret, user, s.cfg.JWT.RefreshTokenTTL, familyID,
	)
	if err != nil {
		return nil, apperr.Internal("Failed to generate refresh token", err)
	}

	// Store token family in Redis for reuse detection
	if s.rdb != nil {
		ctx := context.Background()
		familyKey := fmt.Sprintf("token:family:%s", familyID)
		s.rdb.Set(ctx, familyKey, fmt.Sprintf("%d", user.ID), s.cfg.JWT.RefreshTokenTTL)
	}

	return &AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         toUserResponse(user),
	}, nil
}

func (s *Service) RefreshToken(refreshToken string) (*AuthResponse, error) {
	// Fail closed: Redis is required for refresh token security
	if s.rdb == nil {
		return nil, apperr.ServiceUnavailable("Service unavailable: security subsystem offline")
	}

	// Parse the refresh token using the SEPARATE refresh secret
	claims := &middleware.Claims{}
	_, err := middleware.ParseToken(s.cfg.JWT.RefreshSecret, refreshToken, claims)
	if err != nil {
		return nil, apperr.Unauthorized("Invalid or expired refresh token")
	}

	// Validate that this is actually a refresh token, not an access token
	if claims.TokenType != "refresh" {
		return nil, apperr.Unauthorized("Invalid token type: expected refresh token")
	}

	ctx := context.Background()

	// Check if this specific token has been blacklisted (already used)
	tokenHash := fmt.Sprintf("%x", sha256.Sum256([]byte(refreshToken)))
	blacklisted, err := s.rdb.Exists(ctx, fmt.Sprintf("token:blacklist:%s", tokenHash)).Result()
	if err != nil {
		return nil, apperr.ServiceUnavailable("Service unavailable: cannot verify token status")
	}
	if blacklisted > 0 {
		// TOKEN REUSE DETECTED — this refresh token was already consumed.
		// This indicates a stolen token scenario. Revoke the entire family.
		s.log.Warn("refresh token reuse detected — revoking token family",
			"userID", claims.UserID, "familyID", claims.FamilyID)
		if claims.FamilyID != "" {
			// Delete the family key
			s.rdb.Del(ctx, fmt.Sprintf("token:family:%s", claims.FamilyID))
		}
		// Revoke ALL sessions for this user as a precaution
		s.revokeAllSessions(claims.UserID, 24*time.Hour)
		return nil, apperr.Unauthorized("Token has been revoked — possible token theft detected. All sessions invalidated.")
	}

	// Verify the token family exists and belongs to this user
	if claims.FamilyID != "" {
		familyKey := fmt.Sprintf("token:family:%s", claims.FamilyID)
		storedUserID, err := s.rdb.Get(ctx, familyKey).Result()
		if err == redis.Nil {
			// Family doesn't exist — token was part of a revoked family
			return nil, apperr.Unauthorized("Token family has been revoked")
		} else if err != nil {
			return nil, apperr.ServiceUnavailable("Service unavailable: cannot verify token family")
		}
		if storedUserID != fmt.Sprintf("%d", claims.UserID) {
			return nil, apperr.Unauthorized("Token family mismatch")
		}
	}

	// Check if user is revoked
	revoked, err := s.rdb.SIsMember(ctx, "revoked:users", claims.UserID).Result()
	if err != nil {
		return nil, apperr.ServiceUnavailable("Service unavailable: cannot verify user status")
	}
	if revoked {
		perUserKey := fmt.Sprintf("revoked:user:%d", claims.UserID)
		exists, err := s.rdb.Exists(ctx, perUserKey).Result()
		if err != nil {
			return nil, apperr.ServiceUnavailable("Service unavailable: cannot verify user status")
		}
		if exists > 0 {
			return nil, apperr.Unauthorized("Account suspended")
		}
		// Clean up stale set entry
		s.rdb.SRem(ctx, "revoked:users", claims.UserID)
	}

	user, err := s.repo.FindByID(claims.UserID)
	if err != nil || user.ID == 0 {
		return nil, apperr.Unauthorized("User not found")
	}
	if user.Status == models.StatusBanned || user.Status == models.StatusSuspended {
		return nil, apperr.Forbidden("Account is suspended or banned")
	}

	// Blacklist the old refresh token to prevent reuse (rotation)
	s.rdb.Set(ctx, fmt.Sprintf("token:blacklist:%s", tokenHash), "1", s.cfg.JWT.RefreshTokenTTL)

	// Generate new tokens with the SAME family ID (token rotation within family)
	accessToken, err := middleware.GenerateAccessToken(
		s.cfg.JWT.Secret, user, s.cfg.JWT.AccessTokenTTL,
	)
	if err != nil {
		return nil, apperr.Internal("Failed to generate access token", err)
	}

	newRefreshToken, err := middleware.GenerateRefreshToken(
		s.cfg.JWT.RefreshSecret, user, s.cfg.JWT.RefreshTokenTTL, claims.FamilyID,
	)
	if err != nil {
		return nil, apperr.Internal("Failed to generate refresh token", err)
	}

	return &AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
		User:         toUserResponse(user),
	}, nil
}

func (s *Service) Logout(userID uint, accessToken string, refreshToken string) error {
	// Fail closed: Redis is required for token blacklisting
	if s.rdb == nil {
		return apperr.ServiceUnavailable("Service unavailable: security subsystem offline")
	}

	ctx := context.Background()
	// Blacklist the access token until it expires
	if accessToken != "" {
		tokenHash := fmt.Sprintf("%x", sha256.Sum256([]byte(accessToken)))
		s.rdb.Set(ctx, fmt.Sprintf("token:blacklist:%s", tokenHash), "1", s.cfg.JWT.AccessTokenTTL)
	}
	// Blacklist the refresh token and clean up its family
	if refreshToken != "" {
		tokenHash := fmt.Sprintf("%x", sha256.Sum256([]byte(refreshToken)))
		s.rdb.Set(ctx, fmt.Sprintf("token:blacklist:%s", tokenHash), "1", s.cfg.JWT.RefreshTokenTTL)

		// Parse refresh token to get family ID and delete the family
		claims := &middleware.Claims{}
		if _, err := middleware.ParseToken(s.cfg.JWT.RefreshSecret, refreshToken, claims); err == nil {
			if claims.FamilyID != "" {
				s.rdb.Del(ctx, fmt.Sprintf("token:family:%s", claims.FamilyID))
			}
		}
	}
	s.log.Info("user logged out", "userID", userID)
	return nil
}

// invalidateProfileCache removes the cached profile for a user.
func (s *Service) invalidateProfileCache(userID uint) {
	if s.rdb != nil {
		ctx := context.Background()
		s.rdb.Del(ctx, fmt.Sprintf("user:profile:%d", userID))
	}
}

// revokeAllSessions invalidates all active sessions for a user.
func (s *Service) revokeAllSessions(userID uint, ttl time.Duration) {
	if s.rdb != nil {
		ctx := context.Background()
		s.rdb.SAdd(ctx, "revoked:users", userID)
		s.rdb.Set(ctx, fmt.Sprintf("revoked:user:%d", userID), "1", ttl)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
