package logger

import (
	"log/slog"
	"os"
)

// New creates a structured logger configured for the given environment.
// Production uses JSON, development uses text for readability.
func New(environment string) *slog.Logger {
	var handler slog.Handler

	opts := &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}

	if environment == "development" {
		opts.Level = slog.LevelDebug
		handler = slog.NewTextHandler(os.Stdout, opts)
	} else {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	}

	return slog.New(handler)
}

// WithService returns a logger with the service name attached.
func WithService(log *slog.Logger, service string) *slog.Logger {
	return log.With("service", service)
}

// WithRequestID returns a logger with request correlation ID.
func WithRequestID(log *slog.Logger, requestID string) *slog.Logger {
	return log.With("request_id", requestID)
}
