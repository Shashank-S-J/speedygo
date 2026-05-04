package database

import (
	"fmt"
	"log/slog"
	"time"

	"github.com/speedygo/speedygo/internal/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// New initializes a GORM database connection with connection pooling.
func New(cfg config.DatabaseConfig, log *slog.Logger) (*gorm.DB, error) {
	logLevel := gormlogger.Warn
	if cfg.SSLMode == "disable" {
		logLevel = gormlogger.Info
	}

	db, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
		Logger: gormlogger.Default.LogMode(logLevel),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get underlying sql.DB: %w", err)
	}

	// Connection pool settings
	sqlDB.SetMaxOpenConns(cfg.MaxConns)
	sqlDB.SetMaxIdleConns(cfg.MaxConns / 2)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)

	// Verify connection
	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	log.Info("database connected",
		"host", cfg.Host,
		"port", cfg.Port,
		"dbname", cfg.DBName,
		"max_conns", cfg.MaxConns,
	)

	return db, nil
}

// AutoMigrate runs GORM auto-migration for all provided models.
func AutoMigrate(db *gorm.DB, models ...interface{}) error {
	return db.AutoMigrate(models...)
}
