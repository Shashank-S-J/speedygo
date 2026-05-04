package middleware

import (
	"context"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

// RateLimiter implements a sliding window rate limiter using Redis.
func RateLimiter(rdb *redis.Client, max int, window time.Duration) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if rdb == nil {
			return c.Next() // skip if Redis unavailable
		}
		key := fmt.Sprintf("ratelimit:%s:%s", c.Path(), c.IP())
		ctx := context.Background()

		// Use a Lua script to atomically INCR + set TTL only if key is new
		// This avoids the race where Incr succeeds but Expire fails
		script := redis.NewScript(`
			local current = redis.call('INCR', KEYS[1])
			if current == 1 then
				redis.call('PEXPIRE', KEYS[1], ARGV[1])
			end
			return current
		`)
		current, err := script.Run(ctx, rdb, []string{key}, window.Milliseconds()).Int64()
		if err != nil {
			return c.Next() // on Redis error, allow request
		}

		if int(current) > max {
			c.Set("Retry-After", fmt.Sprintf("%d", int(window.Seconds())))
			return c.Status(429).JSON(fiber.Map{
				"error":   true,
				"message": "Too many requests",
			})
		}

		c.Set("X-RateLimit-Limit", fmt.Sprintf("%d", max))
		c.Set("X-RateLimit-Remaining", fmt.Sprintf("%d", max-int(current)))
		return c.Next()
	}
}
