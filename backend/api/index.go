// Package api is the Vercel serverless entry point. Vercel's Go runtime
// looks for an exported `Handler` symbol with the signature
// `func(http.ResponseWriter, *http.Request)` inside `api/index.go` (or any
// `api/*.go` file) and invokes it for every incoming HTTP request.
//
// The actual Echo application is initialized in `internal/server` and
// built once via `sync.Once` so the database connection pool and
// registered routes are reused across serverless invocations.
package api

import (
	"net/http"

	"spotsync-backend/internal/server"
)

// Handler is what Vercel's Go runtime invokes for every request. Echo's
// `*Echo` implements `http.Handler`, so we just adapt the shared instance
// here. We call `server.Get()` so the very first cold start performs
// initialization.
func Handler(w http.ResponseWriter, r *http.Request) {
	server.Get().ServeHTTP(w, r)
}