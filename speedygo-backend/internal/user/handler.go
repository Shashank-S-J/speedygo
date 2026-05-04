package user

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	apperr "github.com/speedygo/speedygo/internal/errors"
	"github.com/gofiber/fiber/v2"
	"github.com/speedygo/speedygo/internal/config"
)

// Handler exposes HTTP endpoints for user operations.
type Handler struct {
	svc *Service
	cfg *config.Config
}

func NewHandler(svc *Service, cfg *config.Config) *Handler {
	return &Handler{svc: svc, cfg: cfg}
}

// setRefreshTokenCookie sets the refresh token as an HttpOnly secure cookie.
// Uses SameSite=Lax (not Strict) because frontend apps run on different ports/origins
// than the backend API. Strict would block the cookie on cross-origin requests entirely.
func (h *Handler) setRefreshTokenCookie(c *fiber.Ctx, refreshToken string) {
	secure := h.cfg.Server.Environment != "development"
	sameSite := "Lax"
	if h.cfg.Server.Environment == "production" {
		// In production with same-domain setup, Strict is safe.
		// For cross-subdomain deployments, keep Lax.
		sameSite = "Lax"
	}
	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    refreshToken,
		Path:     "/auth",
		HTTPOnly: true,
		Secure:   secure,
		SameSite: sameSite,
		MaxAge:   int(h.cfg.JWT.RefreshTokenTTL.Seconds()),
		Domain:   h.cfg.Server.CookieDomain,
	})
}

// clearRefreshTokenCookie clears the refresh token cookie.
func (h *Handler) clearRefreshTokenCookie(c *fiber.Ctx) {
	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    "",
		Path:     "/auth",
		HTTPOnly: true,
		Secure:   h.cfg.Server.Environment != "development",
		SameSite: "Lax",
		MaxAge:   -1,
		Domain:   h.cfg.Server.CookieDomain,
	})
}

// Register godoc
// POST /auth/register
// Step 1: Validates input, sends OTP to email. Account NOT created yet.
func (h *Handler) Register(c *fiber.Ctx) error {
	var req RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid request body"})
	}
	if req.Email == "" || req.Password == "" || req.FullName == "" || req.Phone == "" || req.Role == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "All fields required"})
	}

	resp, err := h.svc.Register(req)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	// If tokens were returned (dev mode, OTP skipped), set the refresh token cookie
	if resp.AuthResponse != nil && resp.AuthResponse.RefreshToken != "" {
		h.setRefreshTokenCookie(c, resp.AuthResponse.RefreshToken)
	}
	return c.Status(201).JSON(resp)
}

// VerifyRegistrationOTP godoc
// POST /auth/verify-otp
// Step 2: Verifies OTP and creates the account.
func (h *Handler) VerifyRegistrationOTP(c *fiber.Ctx) error {
	var req VerifyOTPRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid request body"})
	}
	resp, err := h.svc.VerifyRegistrationOTP(req)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	// Set refresh token as HttpOnly cookie
	h.setRefreshTokenCookie(c, resp.RefreshToken)
	return c.JSON(resp)
}

// ResendOTP godoc
// POST /auth/resend-otp
func (h *Handler) ResendOTP(c *fiber.Ctx) error {
	var body struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&body); err != nil || body.Email == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Email is required"})
	}
	if err := h.svc.ResendRegistrationOTP(body.Email); err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true, "message": "OTP resent to " + body.Email})
}

// Login godoc
// POST /auth/login
// Supports both password and OTP login.
// Password login: { email, password }
// OTP login: { email, login_method: "otp", otp: "123456" }
func (h *Handler) Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid request body"})
	}
	if req.Email == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Email is required"})
	}
	if req.LoginMethod != "otp" && req.Password == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Password is required"})
	}

	resp, err := h.svc.Login(req, c.IP(), c.Get("User-Agent"))
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	// Set refresh token as HttpOnly cookie
	h.setRefreshTokenCookie(c, resp.RefreshToken)
	return c.JSON(resp)
}

// SendLoginOTP godoc
// POST /auth/login-otp
// Sends OTP for passwordless login.
func (h *Handler) SendLoginOTP(c *fiber.Ctx) error {
	var body struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&body); err != nil || body.Email == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Email is required"})
	}
	if err := h.svc.SendLoginOTP(body.Email); err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true, "message": "If that email exists, a login code has been sent"})
}

// SendChangePasswordOTP godoc
// POST /users/me/password/send-otp
// Sends OTP to user's email for password change verification.
func (h *Handler) SendChangePasswordOTP(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uint)
	if !ok || userID == 0 {
		return c.Status(401).JSON(fiber.Map{"error": true, "message": "Unauthorized"})
	}
	if err := h.svc.SendChangePasswordOTP(userID); err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true, "message": "OTP sent to your email"})
}

// ChangePasswordWithOTP godoc
// PUT /users/me/password/verify-otp
// Verifies OTP and changes password.
func (h *Handler) ChangePasswordWithOTP(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uint)
	if !ok || userID == 0 {
		return c.Status(401).JSON(fiber.Map{"error": true, "message": "Unauthorized"})
	}
	var body struct {
		OTP         string `json:"otp"`
		NewPassword string `json:"new_password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid request body"})
	}
	if body.OTP == "" || body.NewPassword == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "OTP and new_password are required"})
	}
	if err := h.svc.ChangePasswordWithOTP(userID, body.OTP, body.NewPassword); err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true, "message": "Password changed successfully"})
}

// GetProfile godoc
// GET /users/me/profile
func (h *Handler) GetProfile(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uint)
	if !ok || userID == 0 {
		return c.Status(401).JSON(fiber.Map{"error": true, "message": "Unauthorized"})
	}
	resp, err := h.svc.GetProfile(userID)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(resp)
}

// UpdateProfile godoc
// PUT /users/me/profile
func (h *Handler) UpdateProfile(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uint)
	if !ok || userID == 0 {
		return c.Status(401).JSON(fiber.Map{"error": true, "message": "Unauthorized"})
	}
	var req UpdateProfileRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid request body"})
	}

	resp, err := h.svc.UpdateProfile(userID, req)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(resp)
}

// ChangePassword godoc
// PUT /users/me/password
func (h *Handler) ChangePassword(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uint)
	if !ok || userID == 0 {
		return c.Status(401).JSON(fiber.Map{"error": true, "message": "Unauthorized"})
	}
	var req ChangePasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid request body"})
	}
	if req.CurrentPassword == "" || req.NewPassword == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Current and new password are required"})
	}
	if err := h.svc.ChangePassword(userID, req); err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true, "message": "Password changed successfully"})
}

// RefreshToken godoc
// POST /auth/refresh
func (h *Handler) RefreshToken(c *fiber.Ctx) error {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	c.BodyParser(&body)

	// Fallback: read refresh token from HttpOnly cookie if not in body
	refreshToken := body.RefreshToken
	if refreshToken == "" {
		refreshToken = c.Cookies("refresh_token")
	}
	if refreshToken == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "refresh_token is required (body or cookie)"})
	}

	resp, err := h.svc.RefreshToken(refreshToken)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			// On any auth failure, clear the cookie
			h.clearRefreshTokenCookie(c)
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	// Set new refresh token as HttpOnly cookie
	h.setRefreshTokenCookie(c, resp.RefreshToken)
	return c.JSON(resp)
}

// Logout godoc
// POST /auth/logout
// Works with or without a valid access token. If access token is provided and
// valid, it will be blacklisted. The refresh_token in the body is always blacklisted.
func (h *Handler) Logout(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)

	// Extract the access token from Authorization header for blacklisting
	accessToken := ""
	authHeader := c.Get("Authorization")
	if parts := strings.SplitN(authHeader, " ", 2); len(parts) == 2 {
		accessToken = parts[1]
	}
	// Extract the refresh token from request body or HttpOnly cookie
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	c.BodyParser(&body)
	refreshToken := body.RefreshToken
	if refreshToken == "" {
		refreshToken = c.Cookies("refresh_token")
	}

	// Even without a valid access token, we can blacklist the refresh token
	if err := h.svc.Logout(userID, accessToken, refreshToken); err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	// Clear the refresh token cookie
	h.clearRefreshTokenCookie(c)
	return c.JSON(fiber.Map{"ok": true})
}

// ForgotPassword godoc
// POST /auth/forgot-password
// Sends a password reset OTP to the user's email.
func (h *Handler) ForgotPassword(c *fiber.Ctx) error {
	var body struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&body); err != nil || body.Email == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Email is required"})
	}
	if err := h.svc.ForgotPassword(body.Email); err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true, "message": "If that email exists, a reset code has been sent"})
}

// ResetPassword godoc
// POST /auth/reset-password
// Verifies the OTP and sets a new password.
func (h *Handler) ResetPassword(c *fiber.Ctx) error {
	var req ResetPasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid request body"})
	}
	if req.Email == "" || req.OTP == "" || req.NewPassword == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Email, OTP, and new_password are required"})
	}
	if err := h.svc.ResetPassword(req); err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true, "message": "Password reset successfully. You can now log in."})
}

// UploadProfilePhoto godoc
// POST /users/me/photo
// Accepts multipart form file "photo" or base64 JSON body.
func (h *Handler) UploadProfilePhoto(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uint)
	if !ok || userID == 0 {
		return c.Status(401).JSON(fiber.Map{"error": true, "message": "Unauthorized"})
	}

	var photoURL string

	// Try multipart file first
	file, err := c.FormFile("photo")
	if err == nil && file != nil {
		// Validate file size (max 5MB)
		if file.Size > 5*1024*1024 {
			return c.Status(400).JSON(fiber.Map{"error": true, "message": "File size must be less than 5MB"})
		}

		// Validate content type
		ct := file.Header.Get("Content-Type")
		if !strings.HasPrefix(ct, "image/") {
			return c.Status(400).JSON(fiber.Map{"error": true, "message": "Only image files are allowed"})
		}

		// Get extension
		ext := filepath.Ext(file.Filename)
		if ext == "" {
			switch ct {
			case "image/jpeg":
				ext = ".jpg"
			case "image/png":
				ext = ".png"
			case "image/webp":
				ext = ".webp"
			default:
				ext = ".jpg"
			}
		}

		// Save file to uploads directory
		uploadDir := "uploads/avatars"
		os.MkdirAll(uploadDir, 0755)
		filename := fmt.Sprintf("%d_%d%s", userID, time.Now().UnixNano(), ext)
		savePath := filepath.Join(uploadDir, filename)

		if err := c.SaveFile(file, savePath); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": true, "message": "Failed to save file"})
		}

		// Return relative URL (in production, use CDN/S3/R2 URL)
		photoURL = fmt.Sprintf("/uploads/avatars/%s", filename)
	} else {
		// Try base64 JSON body
		var body struct {
			Photo    string `json:"photo"`     // base64 data URL
			Filename string `json:"filename"`
		}
		if err := c.BodyParser(&body); err != nil || body.Photo == "" {
			return c.Status(400).JSON(fiber.Map{"error": true, "message": "Photo file or base64 data is required"})
		}

		// Parse base64 data URL: data:image/png;base64,xxxxx
		parts := strings.SplitN(body.Photo, ",", 2)
		if len(parts) != 2 {
			return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid base64 image format"})
		}

		// Determine extension from mime
		ext := ".jpg"
		if strings.Contains(parts[0], "image/png") {
			ext = ".png"
		} else if strings.Contains(parts[0], "image/webp") {
			ext = ".webp"
		}

		decoded, err := base64.StdEncoding.DecodeString(parts[1])
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid base64 data"})
		}

		// Max 5MB
		if len(decoded) > 5*1024*1024 {
			return c.Status(400).JSON(fiber.Map{"error": true, "message": "File size must be less than 5MB"})
		}

		uploadDir := "uploads/avatars"
		os.MkdirAll(uploadDir, 0755)
		filename := fmt.Sprintf("%d_%d%s", userID, time.Now().UnixNano(), ext)
		savePath := filepath.Join(uploadDir, filename)

		if err := os.WriteFile(savePath, decoded, 0644); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": true, "message": "Failed to save file"})
		}

		photoURL = fmt.Sprintf("/uploads/avatars/%s", filename)
	}

	// Update user profile with new photo URL
	resp, err := h.svc.UpdateProfile(userID, UpdateProfileRequest{Photo: photoURL})
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true, "url": photoURL, "user": resp})
}
