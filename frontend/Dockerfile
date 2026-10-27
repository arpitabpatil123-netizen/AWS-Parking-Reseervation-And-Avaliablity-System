# =============================================================================
# SpotSync frontend - multi-stage Dockerfile (Astro static output)
# =============================================================================
# Stage 1: builder - installs npm dependencies and runs `astro build`
# Stage 2: runtime - nginx:alpine serves the static dist/ on port 4321
#
# The Astro project is configured with `output: 'static'` (see
# frontend/astro.config.mjs) and the home page (`src/pages/index.astro`)
# pre-renders the zone catalog at build time via getZones(), so the
# build stage needs to be able to reach the backend API. We pass the
# in-network service name `http://api:8080/api/v1` as PUBLIC_API_BASE_URL
# (a Vite build-time variable that gets inlined into the JS bundle), so
# the same URL is used for build-time SSR fetch AND runtime browser
# fetch — and both resolve to the `api` service on the shared
# `spotsync-net` docker network. Do NOT hardcode localhost; inside a
# container `localhost` refers to the container itself, not the host
# machine, and docker's service-name DNS is what makes
# container-to-container communication work.
# -----------------------------------------------------------------------------

# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder

# Public API base URL — inlined into the JS bundle at build time.
# We default it to the docker-compose service name `api` on port 8080
# so the static files reference the right host whether they are served
# by the frontend container or fetched at build time by Astro's
# build-time zone fetcher in src/pages/index.astro.
ARG PUBLIC_API_BASE_URL=http://api:8080/api/v1
ENV PUBLIC_API_BASE_URL=${PUBLIC_API_BASE_URL}

WORKDIR /app

# Layer-cache: install dependencies first so unrelated source edits do
# not re-download the entire node_modules graph.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy the rest of the source.
COPY . .

# Build the static site. `astro build` honors `output: 'static'` in
# astro.config.mjs and writes the production output to `dist/`.
RUN npm run build

# ---------- Stage 2: runtime ----------
# nginx:alpine is ~40 MB and serves static files extremely well. It is
# the de-facto static-site runtime for Astro/Docker setups.
FROM nginx:1.27-alpine AS runtime

# OCI labels
LABEL org.opencontainers.image.title="spotsync-frontend" \
      org.opencontainers.image.description="SpotSync Astro static frontend (nginx)" \
      org.opencontainers.image.licenses="MIT"

# Replace the stock nginx config with one tuned for an Astro SPA-style
# static site:
#   - listen on 4321 (the port astro.config.mjs sets for `astro dev` and
#     the same port the README documents for the frontend)
#   - serve /usr/share/nginx/html (where we copy dist/)
#   - SPA-friendly fallback so client-side routes that don't have a
#     physical file (none here, but defensive) still resolve to index.html
#   - long-lived cache for hashed asset filenames emitted under /_astro/
#   - short cache for the entry HTML so config changes ship immediately
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 4321;
    listen [::]:4321;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # gzip text responses — Astro ships pre-minified JS/CSS but the
    # inline SVG/HTML still benefits from compression on the wire.
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript application/xml text/xml;

    # Hashed asset filenames emitted under /_astro/ get a 1-year cache.
    location ~* ^/_astro/.*\.(js|css|woff2?|svg|png|jpe?g|gif|webp|avif|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Everything else (index.html, favicon, robots.txt, etc.) gets a
    # short cache so deploys are picked up promptly.
    location / {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }
}
EOF

# Copy the static build output from the builder.
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --spider --tries=1 --timeout=4 http://127.0.0.1:4321/ || exit 1

CMD ["nginx", "-g", "daemon off;"]