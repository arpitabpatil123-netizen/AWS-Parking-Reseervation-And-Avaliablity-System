package config

import (
	"errors"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
)

// Config holds all application configuration loaded from environment variables.
//
// Secrets (JWT_SECRET, DATABASE_URL) MUST be supplied via the environment or
// a .env file. There are intentionally no in-code defaults for them —
// shipping a fallback secret would let anyone forge tokens against any
// deployment that forgot to set the variable.
type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	FrontendURL string
}

// LoadConfig reads configuration from a .env file (if present) and OS
// environment variables, then validates that every required value is present.
//
// Returns an error if JWT_SECRET is missing — without it the server cannot
// safely sign or verify tokens. DATABASE_URL is reported as a warning so the
// process can still boot (the database layer logs its own connection error)
// but JWT-backed endpoints will refuse to authenticate.
func LoadConfig() (*Config, error) {
	// Load .env if it exists; ignore the error when the file is not present so
	// production deployments that rely on real env vars still work.
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, falling back to OS environment variables")
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		return nil, errors.New("JWT_SECRET is not set; refusing to start with a missing signing key")
	}

	cfg := &Config{
		Port:        getEnv("APP_PORT", "8080"),
		DatabaseURL: getEnv("DATABASE_URL", ""),
		JWTSecret:   jwtSecret,
		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:4321"),
	}

	if cfg.DatabaseURL == "" {
		log.Println("WARNING: DATABASE_URL is not set; database-dependent features will fail")
	}

	if cfg.FrontendURL == "" {
		log.Println("WARNING: FRONTEND_URL is not set; CORS will reject all origins")
	}

	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	return cfg, nil
}

// Validate enforces invariants callers can rely on (e.g. the auth middleware
// can assume JWTSecret is non-empty). Kept exported so other packages can
// double-check a Config they received from elsewhere.
func (c *Config) Validate() error {
	if c.JWTSecret == "" {
		return errors.New("JWT_SECRET must not be empty")
	}
	if c.Port == "" {
		return errors.New("APP_PORT must not be empty")
	}
	return nil
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}
	return fallback
}
