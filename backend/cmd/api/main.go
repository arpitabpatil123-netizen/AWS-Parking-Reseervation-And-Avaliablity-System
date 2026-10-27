package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"spotsync-backend/internal/config"
	"spotsync-backend/internal/server"
)

// main is only invoked when running the binary locally (`go run` or the
// compiled executable). On Vercel, the platform imports `api/index.go`
// and invokes the exported `Handler` function directly, so the long-running
// server only exists in local development.
func main() {
	// Build (or reuse) the shared Echo instance.
	e := server.Get()

	// Load config just for the port + graceful shutdown.
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Printf("ERROR: Failed to load configuration: %v", err)
		cfg = &config.Config{}
	}

	// 5. Start server with graceful shutdown
	go func() {
		if err := e.Start(":" + cfg.Port); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()
	log.Printf("SpotSync API server listening on port %s", cfg.Port)

	// Wait for termination signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit
	log.Println("Shutdown signal received")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := e.Shutdown(ctx); err != nil {
		log.Printf("Error during shutdown: %v", err)
	}
	log.Println("Server stopped")
}