package middleware

import (
	"context"
	"crypto/sha256"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
	"github.com/speedygo/speedygo/internal/models"
)

// Claims represents JWT token claims.
type Claims struct {
	UserID    uint            `json:"user_id"`
	Email     string          `json:"email"`
	Role      models.UserRole `json:"role"`
	TokenType string          `json:"token_type,omitempty"` // "access" or "refresh"
	FamilyID  string          `json:"family_id,omitempty"`  // Token family for reuse detection
	jwt.RegisteredClaims
}

// JWTAuth validates JWT tokens and checks Redis blacklist.
// Redis is REQUIRED for security-critical operations — fails closed if unavailable.
func JWTAuth(secret string, rdb *redis.Client) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Fail closed: Redis is required for token blacklist checks
		if rdb == nil {
			return c.Status(503).JSON(fiber.Map{"error": true, "message": "Service unavailable: security subsystem offline"})
		}

		authHeader := c.Get("Authorization")
		var tokenStr string

		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				return c.Status(401).JSON(fiber.Map{"error": true, "message": "Invalid auth format"})
			}
			tokenStr = parts[1]
		} else {
			// Fallback: accept token from query param (for WebSocket connections)
			tokenStr = c.Query("token")
		}

		if tokenStr == "" {
			return c.Status(401).JSON(fiber.Map{"error": true, "message": "Missing authorization"})
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.ErrUnauthorized
			}
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			return c.Status(401).JSON(fiber.Map{"error": true, "message": "Invalid or expired token"})
		}
		// Reject refresh tokens being used as access tokens
		if claims.TokenType == "refresh" {
			return c.Status(401).JSON(fiber.Map{"error": true, "message": "Invalid token type"})
		}

		ctx := context.Background()
		// Check if user account is revoked (suspended/banned)
		revoked, err := rdb.SIsMember(ctx, "revoked:users", claims.UserID).Result()
		if err != nil {
			// Fail closed on Redis error
			return c.Status(503).JSON(fiber.Map{"error": true, "message": "Service unavailable: cannot verify token status"})
		}
		if revoked {
			perUserKey := fmt.Sprintf("revoked:user:%d", claims.UserID)
			exists, err := rdb.Exists(ctx, perUserKey).Result()
			if err != nil {
				return c.Status(503).JSON(fiber.Map{"error": true, "message": "Service unavailable: cannot verify token status"})
			}
			if exists > 0 {
				return c.Status(401).JSON(fiber.Map{"error": true, "message": "Account suspended"})
			}
			// Per-user key expired but set entry remains — clean it up
			rdb.SRem(ctx, "revoked:users", claims.UserID)
		}
		// Check if this specific token has been blacklisted (logout/refresh rotation)
		tokenHash := fmt.Sprintf("%x", sha256.Sum256([]byte(tokenStr)))
		blacklisted, err := rdb.Exists(ctx, fmt.Sprintf("token:blacklist:%s", tokenHash)).Result()
		if err != nil {
			return c.Status(503).JSON(fiber.Map{"error": true, "message": "Service unavailable: cannot verify token status"})
		}
		if blacklisted > 0 {
			return c.Status(401).JSON(fiber.Map{"error": true, "message": "Token has been revoked"})
		}

		c.Locals("userID", claims.UserID)
		c.Locals("email", claims.Email)
		c.Locals("role", claims.Role)
		return c.Next()
	}
}

// OptionalJWTAuth attempts to validate the JWT token but does NOT reject the request
// if the token is missing or invalid. It populates context locals if valid.
// Used for endpoints like logout where the user might have an expired access token.
func OptionalJWTAuth(secret string, rdb *redis.Client) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		var tokenStr string

		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
				tokenStr = parts[1]
			}
		}

		if tokenStr == "" {
			return c.Next()
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.ErrUnauthorized
			}
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			// Token invalid/expired — continue without setting locals
			return c.Next()
		}
		if claims.TokenType == "refresh" {
			return c.Next()
		}

		c.Locals("userID", claims.UserID)
		c.Locals("email", claims.Email)
		c.Locals("role", claims.Role)
		return c.Next()
	}
}

// RequireRole checks authenticated user has one of the allowed roles.
func RequireRole(roles ...models.UserRole) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userRole, ok := c.Locals("role").(models.UserRole)
		if !ok {
			return c.Status(403).JSON(fiber.Map{"error": true, "message": "Access denied"})
		}
		for _, r := range roles {
			if userRole == r {
				return c.Next()
			}
		}
		return c.Status(403).JSON(fiber.Map{"error": true, "message": "Insufficient permissions"})
	}
}

// GenerateAccessToken creates a JWT access token.
func GenerateAccessToken(secret string, user *models.User, ttl time.Duration) (string, error) {
	claims := Claims{
		UserID:    user.ID,
		Email:     user.Email,
		Role:      user.Role,
		TokenType: "access",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   fmt.Sprintf("%d", user.ID),
			Issuer:    "speedygo",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// GenerateRefreshToken creates a JWT refresh token with a distinct token_type claim and family ID.
func GenerateRefreshToken(secret string, user *models.User, ttl time.Duration, familyID string) (string, error) {
	claims := Claims{
		UserID:    user.ID,
		Email:     user.Email,
		Role:      user.Role,
		TokenType: "refresh",
		FamilyID:  familyID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   fmt.Sprintf("%d", user.ID),
			Issuer:    "speedygo",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// ParseToken parses and validates a JWT token string, populating the given claims.
func ParseToken(secret string, tokenStr string, claims *Claims) (*jwt.Token, error) {
	return jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
}

// RequireReAuth demands the admin re-submits their password via X-Admin-Password header
// for destructive operations (permaban, bulk suspend, etc.).
func RequireReAuth(rdb *redis.Client) fiber.Handler {
	return func(c *fiber.Ctx) error {
		password := c.Get("X-Admin-Password")
		if password == "" {
			return c.Status(403).JSON(fiber.Map{
				"error":   true,
				"message": "Re-authentication required. Provide X-Admin-Password header.",
			})
		}
		// Store password in locals for service layer to verify against DB
		c.Locals("reAuthPassword", password)
		return c.Next()
	}
}
