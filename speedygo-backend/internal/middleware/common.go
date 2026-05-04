package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v2"
)

// RequestID injects a unique request ID into context and response headers.
func RequestID() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Get("X-Request-ID")
		if id == "" {
			b := make([]byte, 16)
			rand.Read(b)
			id = hex.EncodeToString(b)
		}
		c.Set("X-Request-ID", id)
		c.Locals("requestID", id)
		return c.Next()
	}
}

// Logger logs each request with duration and status.
func Logger(log *slog.Logger) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		duration := time.Since(start)

		reqID, _ := c.Locals("requestID").(string)

		log.Info("request",
			"method", c.Method(),
			"path", c.Path(),
			"status", c.Response().StatusCode(),
			"duration_ms", duration.Milliseconds(),
			"ip", c.IP(),
			"request_id", reqID,
		)

		return err
	}
}

// CORS adds Cross-Origin Resource Sharing headers.
// When credentials are used (cookies, Authorization header), the browser
// requires a specific origin (not "*") and Access-Control-Allow-Credentials: true.
func CORS(allowedOrigins ...string) fiber.Handler {
	// Build a set of allowed origins for O(1) lookup
	originSet := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		originSet[o] = true
	}
	allowAll := len(allowedOrigins) == 0 || originSet["*"]

	return func(c *fiber.Ctx) error {
		origin := c.Get("Origin")

		// Determine if this origin is allowed
		if allowAll || originSet[origin] {
			if origin != "" {
				c.Set("Access-Control-Allow-Origin", origin)
			} else {
				c.Set("Access-Control-Allow-Origin", "*")
			}
		} else if origin != "" {
			// Origin not allowed — don't set CORS headers, browser will block
			if c.Method() == fiber.MethodOptions {
				return c.SendStatus(fiber.StatusForbidden)
			}
			return c.Next()
		}

		c.Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		c.Set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Request-ID,X-Admin-Password")
		c.Set("Access-Control-Expose-Headers", "X-Request-ID,X-RateLimit-Limit,X-RateLimit-Remaining,Retry-After")
		c.Set("Access-Control-Allow-Credentials", "true")
		c.Set("Access-Control-Max-Age", "86400")
		c.Set("Vary", "Origin")

		if c.Method() == fiber.MethodOptions {
			return c.SendStatus(fiber.StatusNoContent)
		}
		return c.Next()
	}
}

// ErrorHandler is a global fiber error handler that returns structured JSON errors.
func ErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	msg := "Internal server error"

	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
		msg = e.Message
	}

	return c.Status(code).JSON(fiber.Map{
		"error":   true,
		"message": msg,
	})
}

// Recover catches panics and returns a 500 error.
func Recover(log *slog.Logger) fiber.Handler {
	return func(c *fiber.Ctx) error {
		defer func() {
			if r := recover(); r != nil {
				log.Error("panic recovered",
					"error", r,
					"path", c.Path(),
					"method", c.Method(),
				)
				c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error":   true,
					"message": "Internal server error",
				})
			}
		}()
		return c.Next()
	}
}
