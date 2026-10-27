package database

import (
	"fmt"
	"log"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"spotsync-backend/internal/config"
	"spotsync-backend/internal/models"
)

// ConnectDB opens a GORM connection to PostgreSQL using the supplied
// DATABASE_URL, configures a sensible connection pool, and returns the
// *gorm.DB handle.
func ConnectDB(cfg *config.Config) (*gorm.DB, error) {
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is not configured")
	}

	gormLogger := logger.New(
		log.New(os.Stdout, "\r\n[gorm] ", log.LstdFlags),
		logger.Config{
			SlowThreshold:             200 * time.Millisecond,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  true,
		},
	)

	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: gormLogger,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve underlying sql.DB: %w", err)
	}

	// Connection pool tuning
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(15 * time.Minute)

	log.Println("Database connection established successfully")

	return db, nil
}

// AutoMigrate runs GORM auto-migrations for every domain model so the
// corresponding PostgreSQL tables (and their constraints/indexes) exist
// before the HTTP server starts handling traffic.
func AutoMigrate(db *gorm.DB) error {
	if err := db.AutoMigrate(
		&models.User{},
		&models.ParkingZone{},
		&models.Reservation{},
	); err != nil {
		return fmt.Errorf("auto-migration failed: %w", err)
	}
	log.Println("Database auto-migration completed successfully")
	return nil
}
