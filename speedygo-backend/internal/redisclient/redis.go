package redisclient

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/redis/go-redis/v9"
	"github.com/speedygo/speedygo/internal/config"
)

// New creates a Redis client and verifies connection.
func New(cfg config.RedisConfig, log *slog.Logger) (*redis.Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	ctx := context.Background()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	log.Info("Redis connected", "addr", cfg.Addr, "db", cfg.DB)
	return rdb, nil
}
