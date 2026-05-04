package otp

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

// ─── OTP Service ───
// Generates, stores, and verifies 6-digit OTPs using Redis.
// Sends OTP via email using Resend (free tier: 3000 emails/day).
//
// Flow:
//   1. POST /auth/register → returns pending_token (no account created yet)
//   2. POST /auth/verify-otp { token, otp } → creates account + returns JWT
//   3. POST /bookings → returns booking with otp_required=true
//   4. POST /bookings/:id/verify-otp { otp } → confirms booking
//
// Anti-abuse:
//   - Max 5 OTP requests per email per hour
//   - OTP valid for 5 minutes
//   - Max 3 verification attempts per OTP
//   - Cryptographically secure random generation

const (
	OTPLength      = 6
	OTPTTL         = 5 * time.Minute
	MaxAttempts    = 3
	RateLimitMax   = 5
	RateLimitWindow = 1 * time.Hour
)

// Purpose defines what the OTP is for.
type Purpose string

const (
	PurposeRegistration  Purpose = "register"
	PurposeBooking       Purpose = "booking"
	PurposeLogin         Purpose = "login"
	PurposePasswordReset Purpose = "password_reset"
)

// Service handles OTP generation, storage, and verification.
type Service struct {
	rdb        *redis.Client
	log        *slog.Logger
	resendKey  string
	httpClient *http.Client
	fromEmail  string
}

func NewService(rdb *redis.Client, resendKey string, log *slog.Logger) *Service {
	return &Service{
		rdb:        rdb,
		log:        log,
		resendKey:  resendKey,
		httpClient: &http.Client{Timeout: 10 * time.Second},
		fromEmail:  "SpeedyGo <noreply@speedygo.in>",
	}
}

// Generate creates a cryptographically secure 6-digit OTP.
func Generate() string {
	code := ""
	for i := 0; i < OTPLength; i++ {
		n, _ := rand.Int(rand.Reader, big.NewInt(10))
		code += fmt.Sprintf("%d", n.Int64())
	}
	return code
}

// otpKey returns the Redis key for storing OTP data.
func otpKey(identifier string, purpose Purpose) string {
	return fmt.Sprintf("otp:%s:%s", purpose, identifier)
}

// rateLimitKey returns the Redis key for OTP rate limiting.
func rateLimitKey(identifier string) string {
	return fmt.Sprintf("otp:ratelimit:%s", identifier)
}

// attemptsKey returns the Redis key for tracking verification attempts.
func attemptsKey(identifier string, purpose Purpose) string {
	return fmt.Sprintf("otp:attempts:%s:%s", purpose, identifier)
}

// SendOTP generates an OTP, stores it in Redis, and sends it via email.
func (s *Service) SendOTP(ctx context.Context, email string, purpose Purpose) error {
	if s.rdb == nil {
		return fmt.Errorf("OTP service requires Redis")
	}

	// Rate limit: max 5 OTP requests per email per hour
	rlKey := rateLimitKey(email)
	count, _ := s.rdb.Incr(ctx, rlKey).Result()
	if count == 1 {
		s.rdb.Expire(ctx, rlKey, RateLimitWindow)
	}
	if count > int64(RateLimitMax) {
		return fmt.Errorf("too many OTP requests. Try again later")
	}

	code := Generate()

	// Store OTP in Redis with TTL
	key := otpKey(email, purpose)
	s.rdb.Set(ctx, key, code, OTPTTL)

	// Reset attempt counter
	s.rdb.Del(ctx, attemptsKey(email, purpose))

	// Send email
	if err := s.sendOTPEmail(email, code, purpose); err != nil {
		s.log.Error("failed to send OTP email", "email", email, "error", err)
		return fmt.Errorf("failed to send OTP email")
	}

	s.log.Info("OTP sent", "email", email, "purpose", purpose)
	return nil
}

// VerifyOTP checks the OTP against Redis store.
func (s *Service) VerifyOTP(ctx context.Context, email string, purpose Purpose, code string) error {
	if s.rdb == nil {
		return fmt.Errorf("OTP service requires Redis")
	}

	// Check attempt count
	attKey := attemptsKey(email, purpose)
	attempts, _ := s.rdb.Incr(ctx, attKey).Result()
	if attempts == 1 {
		s.rdb.Expire(ctx, attKey, OTPTTL)
	}
	if attempts > int64(MaxAttempts) {
		// Expire the OTP after too many failed attempts
		s.rdb.Del(ctx, otpKey(email, purpose))
		s.rdb.Del(ctx, attKey)
		return fmt.Errorf("too many failed attempts. Request a new OTP")
	}

	key := otpKey(email, purpose)
	stored, err := s.rdb.Get(ctx, key).Result()
	if err != nil {
		return fmt.Errorf("OTP expired or not found. Request a new one")
	}

	if stored != code {
		remaining := int64(MaxAttempts) - attempts
		return fmt.Errorf("invalid OTP. %d attempts remaining", remaining)
	}

	// OTP verified — clean up
	s.rdb.Del(ctx, key)
	s.rdb.Del(ctx, attKey)

	s.log.Info("OTP verified", "email", email, "purpose", purpose)
	return nil
}

// sendOTPEmail sends the OTP code via Resend email API.
func (s *Service) sendOTPEmail(to, code string, purpose Purpose) error {
	subject := "SpeedyGo - Verification Code"
	purposeText := "complete your registration"
	if purpose == PurposeBooking {
		subject = "SpeedyGo - Booking Verification"
		purposeText = "confirm your booking"
	} else if purpose == PurposeLogin {
		subject = "SpeedyGo - Login Verification"
		purposeText = "verify your login"
	}

	html := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f4f4f5;">
<div style="max-width: 480px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
  <div style="background: linear-gradient(135deg, #3B82F6, #1D4ED8); padding: 32px; text-align: center;">
    <h1 style="color: #fff; margin: 0; font-size: 24px;">🚚 SpeedyGo</h1>
  </div>
  <div style="padding: 32px; text-align: center;">
    <p style="color: #52525b; font-size: 16px; margin: 0 0 24px;">Use this code to %s:</p>
    <div style="background: #f4f4f5; border-radius: 12px; padding: 20px 32px; display: inline-block; margin: 0 0 24px;">
      <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #18181b; font-family: 'SF Mono', monospace;">%s</span>
    </div>
    <p style="color: #a1a1aa; font-size: 13px; margin: 0;">This code expires in <strong>5 minutes</strong>.</p>
    <p style="color: #a1a1aa; font-size: 13px; margin: 8px 0 0;">If you didn't request this, ignore this email.</p>
  </div>
  <div style="background: #f4f4f5; padding: 16px; text-align: center;">
    <p style="color: #a1a1aa; font-size: 11px; margin: 0;">© SpeedyGo Transport Platform</p>
  </div>
</div>
</body>
</html>`, purposeText, code)

	if s.resendKey == "" {
		// Dev mode: log OTP to console instead of sending email
		s.log.Warn("DEV MODE: OTP code (no email sent)", "to", to, "code", code, "purpose", purpose)
		return nil
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"from":    s.fromEmail,
		"to":      []string{to},
		"subject": subject,
		"html":    html,
	})

	req, _ := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.resendKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("resend request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("resend API returned %d", resp.StatusCode)
	}

	return nil
}

// StoreRegistrationData temporarily stores registration data in Redis
// while waiting for OTP verification.
func (s *Service) StoreRegistrationData(ctx context.Context, email string, data []byte) error {
	key := fmt.Sprintf("otp:regdata:%s", email)
	return s.rdb.Set(ctx, key, data, 10*time.Minute).Err()
}

// GetRegistrationData retrieves stored registration data.
func (s *Service) GetRegistrationData(ctx context.Context, email string) ([]byte, error) {
	key := fmt.Sprintf("otp:regdata:%s", email)
	data, err := s.rdb.Get(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("registration data expired or not found")
	}
	return []byte(data), nil
}

// ClearRegistrationData removes stored registration data after successful verification.
func (s *Service) ClearRegistrationData(ctx context.Context, email string) {
	s.rdb.Del(ctx, fmt.Sprintf("otp:regdata:%s", email))
}

