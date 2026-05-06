package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds all configuration for the application.
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Redis    RedisConfig
	NATS     NATSConfig
	JWT      JWTConfig
	Stripe   StripeConfig
	KYC      KYCConfig
	AI       AIConfig
	Storage  StorageConfig
	Map      MapConfig
}

type ServerConfig struct {
	Port         string
	Host         string
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	Environment  string // development, staging, production
	CookieDomain string
}

type DatabaseConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
	SSLMode  string
	MaxConns int
}

func (d DatabaseConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		d.Host, d.Port, d.User, d.Password, d.DBName, d.SSLMode,
	)
}

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
	UseTLS   bool
}

type NATSConfig struct {
	URL       string
	ClusterID string
}

type JWTConfig struct {
	Secret          string
	RefreshSecret   string
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
	Issuer          string
}

type StripeConfig struct {
	SecretKey     string
	WebhookSecret string
	LiveMode      bool
}

type KYCConfig struct {
	DiditClientID     string
	DiditClientSecret string
	DiditBaseURL      string
	SandboxAPIKey     string
	SandboxBaseURL    string
}

type AIConfig struct {
	GroqAPIKey  string
	GroqBaseURL string
	GroqModel   string
}

type StorageConfig struct {
	R2AccountID       string
	R2AccessKeyID     string
	R2SecretAccessKey string
	R2BucketName      string
	R2Endpoint        string
}

type MapConfig struct {
	NominatimURL string // Self-hosted Nominatim or public
	OSRMURL      string // Self-hosted OSRM or public
	TileURL      string // Tile server URL
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	cfg := &Config{
		Server: ServerConfig{
			Port:         getEnv("SERVER_PORT", "8080"),
			Host:         getEnv("SERVER_HOST", "0.0.0.0"),
			ReadTimeout:  getDurationEnv("SERVER_READ_TIMEOUT", 10*time.Second),
			WriteTimeout: getDurationEnv("SERVER_WRITE_TIMEOUT", 10*time.Second),
			Environment:  getEnv("ENVIRONMENT", "development"),
			CookieDomain: getEnv("COOKIE_DOMAIN", ""),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getIntEnv("DB_PORT", 5432),
			User:     getEnv("DB_USER", "speedygo"),
			Password: getEnv("DB_PASSWORD", "speedygo"),
			DBName:   getEnv("DB_NAME", "speedygo"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
			MaxConns: getIntEnv("DB_MAX_CONNS", 20),
		},
		Redis: RedisConfig{
			Addr:     getEnv("REDIS_ADDR", "localhost:6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getIntEnv("REDIS_DB", 0),
			UseTLS:   getEnv("REDIS_TLS", "false") == "true" || getEnv("REDIS_PASSWORD", "") != "",
		},
		NATS: NATSConfig{
			URL:       getEnv("NATS_URL", "nats://localhost:4222"),
			ClusterID: getEnv("NATS_CLUSTER_ID", "speedygo-cluster"),
		},
		JWT: JWTConfig{
			Secret:          getEnv("JWT_SECRET", "dev-secret-change-in-production"),
			RefreshSecret:   getEnv("JWT_REFRESH_SECRET", ""),
			AccessTokenTTL:  getDurationEnv("JWT_ACCESS_TTL", 15*time.Minute),
			RefreshTokenTTL: getDurationEnv("JWT_REFRESH_TTL", 7*24*time.Hour),
			Issuer:          getEnv("JWT_ISSUER", "speedygo"),
		},
		Stripe: StripeConfig{
			SecretKey:     getEnv("STRIPE_SECRET_KEY", ""),
			WebhookSecret: getEnv("STRIPE_WEBHOOK_SECRET", ""),
			LiveMode:      getBoolEnv("STRIPE_LIVE_MODE", false),
		},
		KYC: KYCConfig{
			DiditClientID:     getEnv("DIDIT_CLIENT_ID", ""),
			DiditClientSecret: getEnv("DIDIT_CLIENT_SECRET", ""),
			DiditBaseURL:      getEnv("DIDIT_BASE_URL", "https://verification.didit.me/v3"),
			SandboxAPIKey:     getEnv("SANDBOX_API_KEY", ""),
			SandboxBaseURL:    getEnv("SANDBOX_BASE_URL", "https://api.sandbox.co.in"),
		},
		AI: AIConfig{
			GroqAPIKey:  getEnv("GROQ_API_KEY", ""),
			GroqBaseURL: getEnv("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
			GroqModel:   getEnv("GROQ_MODEL", "llama-3.3-70b-versatile"),
		},
		Storage: StorageConfig{
			R2AccountID:       getEnv("R2_ACCOUNT_ID", ""),
			R2AccessKeyID:     getEnv("R2_ACCESS_KEY_ID", ""),
			R2SecretAccessKey: getEnv("R2_SECRET_ACCESS_KEY", ""),
			R2BucketName:      getEnv("R2_BUCKET_NAME", "speedygo"),
			R2Endpoint:        getEnv("R2_ENDPOINT", ""),
		},
		Map: MapConfig{
			NominatimURL: getEnv("NOMINATIM_URL", "https://nominatim.openstreetmap.org"),
			OSRMURL:      getEnv("OSRM_URL", "https://router.project-osrm.org"),
			TileURL:      getEnv("TILE_URL", "https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
		},
	}

	// If RefreshSecret is not set, derive it from Secret (but different)
	if cfg.JWT.RefreshSecret == "" {
		cfg.JWT.RefreshSecret = cfg.JWT.Secret + "-refresh"
	}

	// Validate: reject default JWT secret in production/staging
	if cfg.Server.Environment != "development" && cfg.JWT.Secret == "dev-secret-change-in-production" {
		panic("FATAL: JWT_SECRET must be changed from the default value in " + cfg.Server.Environment + " environment. Set a strong random secret (64+ chars) via JWT_SECRET env var.")
	}
	if cfg.Server.Environment != "development" && cfg.JWT.RefreshSecret == "dev-secret-change-in-production-refresh" {
		panic("FATAL: JWT_REFRESH_SECRET must be set in " + cfg.Server.Environment + " environment. Set a strong random secret (64+ chars) via JWT_REFRESH_SECRET env var.")
	}

	return cfg
}

// Helper functions for environment variable parsing.

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getIntEnv(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getBoolEnv(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func getDurationEnv(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}
