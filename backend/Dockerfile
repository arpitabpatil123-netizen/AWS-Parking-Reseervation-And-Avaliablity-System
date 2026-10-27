# =============================================================================
# SpotSync Backend - production multi-stage Dockerfile
# =============================================================================
# Stage 1: builder  - compiles a fully static Linux binary
# Stage 2: runtime  - minimal Debian slim image, runs as non-root, includes
#                     wget for an in-image HTTP healthcheck against /health.
# -----------------------------------------------------------------------------

# ---------- Stage 1: builder ----------
FROM golang:1.25-alpine AS builder

# Git is required so `go mod download` can resolve modules that use
# pseudo-version commit hashes. ca-certificates lets the binary make
# TLS connections (e.g. to Neon Postgres) on first use.
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /src

# Layer-cache: download modules first so unrelated source edits do not
# re-download the entire dependency graph.
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source.
COPY . .

# Build a static, stripped, version-tagged binary.
#   CGO_ENABLED=0  -> fully static binary
#   -ldflags '-s -w -extldflags "-static"' -> strip symbol/debug info
#   -trimpath      -> reproducible builds (no host paths in binary)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
      -trimpath \
      -ldflags='-s -w -extldflags "-static"' \
      -o /out/spotsync-backend \
      ./cmd/api

# ---------- Stage 2: runtime ----------
# debian:bookworm-slim is small (~75 MB) and includes wget for the
# in-image HEALTHCHECK, while still letting us run as a non-root user.
FROM debian:bookworm-slim AS runtime

# OCI labels
LABEL org.opencontainers.image.title="spotsync-backend" \
      org.opencontainers.image.description="SpotSync REST API (Go + Echo + GORM/Postgres)" \
      org.opencontainers.image.source="https://example.com/spotsync" \
      org.opencontainers.image.licenses="MIT"

# Install wget for the HEALTHCHECK, and tini for proper signal handling
# (so SIGTERM reaches the Go process for graceful shutdown instead of
# PID 1 eating the signal). Clean apt cache in the same layer to keep
# the image small.
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy CA certificates so the binary can verify TLS (Neon requires SSL).
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the compiled binary into a stable location.
COPY --from=builder /out/spotsync-backend /usr/local/bin/spotsync-backend

# Create an unprivileged user and a writable home (in case the app ever
# needs to write files). UID 10001 sits above the system range on Debian
# (SYS_UID_MAX 999) so it cannot collide with future system accounts; an
# informational warning from useradd about that is expected and harmless.
RUN groupadd --system --gid 10001 spotsync \
    && useradd  --system --uid 10001 --gid spotsync --home /app --shell /usr/sbin/nologin spotsync \
    && mkdir -p /app \
    && chown -R spotsync:spotsync /app

WORKDIR /app

USER spotsync:spotsync

# Container will listen on APP_PORT (defaults to 8080 in config.go).
EXPOSE 8080

# Environment variables with safe defaults. These can still be overridden
# at `docker run` / compose time.
ENV APP_PORT=8080 \
    FRONTEND_URL=http://localhost:4321 \
    TZ=Asia/Kolkata

# Use tini as PID 1 so SIGTERM is forwarded to the Go process and
# zombie children are reaped.
ENTRYPOINT ["/usr/bin/tini", "--"]

# Run the binary directly. Echo's startup will read APP_PORT from env.
CMD ["/usr/local/bin/spotsync-backend"]

# Healthcheck: hit the /health endpoint that server.go exposes.
#   --spider    do not save the file, only check it exists
#   --quiet     no progress output
#   --method=GET  wget's spider uses HEAD by default which Echo rejects;
#                 force GET so the route handler returns 200.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --quiet --spider --method=GET --tries=1 --timeout=4 http://127.0.0.1:${APP_PORT}/health || exit 1
