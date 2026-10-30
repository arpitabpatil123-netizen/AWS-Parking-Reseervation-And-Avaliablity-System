c# SpotSync — Smart Parking & EV Charging Reservation Platform

A full-stack reservation system for busy airports and malls that lets drivers browse parking zones (including limited EV charging spots), reserve a spot in real time, and lets admins manage the catalog, pricing, and all reservations. The platform is built with a strict Go backend following clean architecture, and an Astro + React frontend with Tailwind UI components.

## Project Overview

SpotSync solves a real-world problem: airports and malls have limited high-demand parking and EV charging spots, but drivers discover they are full only on arrival. SpotSync centralizes the catalog, exposes live availability, and lets drivers lock in a spot with a license plate before they arrive.

The demo catalog uses Bengaluru and Karnataka locations, prices are in INR per hour, and displayed timestamps use `Asia/Kolkata`. On startup, the seeder localizes default legacy demo zones and prices; customized legacy prices are preserved and logged for manual INR review. Map/nearby search and payment-provider integrations are not currently configured.

The platform supports two first-class personas:

- **Driver** — browse the zone catalog, reserve a spot, view and cancel their own reservations.
- **Admin** — same as driver, plus create / update / delete zones, view all reservations, manage users, and manage incidents.
- **Staff** — provisioned by an administrator for incident reporting and zone-closure management.

---

## Feature Highlights

- 40 zone catalog auto-seeded on first boot, split into 60% available / 40% full by a background rotator.
- Live `available_spots` counter on every zone (computed from `total_capacity - active_reservations - rotation_hold`).
- JWT-based authentication with role-aware middleware (driver vs admin).
- Public zone browsing, so the marketing surface of the home page never forces a login.
- Reservation flow with concurrency safety (zone-full returns 409 Conflict).
- Incident management for admins and provisioned staff, with auditable status history and emergency zone closures.
- Persistent in-app alerts for drivers with active reservations affected by a zone incident; duplicate event alerts are prevented in PostgreSQL.
- Emergency closures reduce public availability to zero and block bookings in the reservation transaction, independently of the background availability rotator.
- Full admin console: KPIs, drivers, users, reservations, and zones grid.
- Server-side rendering on the home page with first-paint populated from the Go API.
- React islands for interactive surfaces (admin tables, reservation modal, profile settings).
- CORS hardened to the Astro frontend origin (never wildcard) so credentials and Bearer tokens are accepted.
- Graceful health endpoint (`/health`) independent of the database, safe for Vercel / load balancers.

---

## Tech Stack

### Backend (`/backend`)
| Layer | Technology |
| --- | --- |
| Language | Go 1.25 |
| Web framework | Echo v4 (`github.com/labstack/echo/v4`) |
| ORM | GORM with PostgreSQL driver |
| Database | PostgreSQL (NeonDB in production) |
| Validation | `go-playground/validator/v10` |
| Auth | `golang-jwt/jwt/v5` |
| Password hashing | `golang.org/x/crypto/bcrypt` (cost 10) |
| Config | `joho/godotenv` |
| Hot reload (dev) | `air` (`.air.toml`) |

### Frontend (`/frontend`)
| Layer | Technology |
| --- | --- |
| Framework | Astro 4 (static output, selective hydration) |
| UI islands | React 18 via `@astrojs/react` |
| Styling | Tailwind CSS 3 + `tailwindcss-animate` |
| Primitives | Radix UI (Dialog, Progress, Slot) |
| State | `nanostores` + `@nanostores/persistent` |
| Icons | `lucide-react` |
| Charts | `recharts` (admin dashboard) |
| Helpers | `clsx`, `tailwind-merge`, `class-variance-authority` |
| Types | TypeScript 5 |

---

## Run Locally (Windows PowerShell)

Run the API and frontend in **two separate PowerShell terminals**. Start at the
repository root:

```powershell
Set-Location "C:\path\to\AWS-Parking-Reseervation-And-Avaliablity-System"
```

### Prerequisites

- Go 1.25 or newer
- Node.js 20 or newer and npm
- PostgreSQL 16 or newer, running locally and accepting connections on port
  `5432`

Create a PostgreSQL user and database for the app if you do not already have
them. For example, connect to your local server as a PostgreSQL administrator:

```powershell
psql -U postgres -h localhost -p 5432
```

Then run these SQL statements in the `psql` prompt, replacing the example
password with a local password:

```sql
CREATE USER spotsync WITH PASSWORD 'replace_with_local_password';
CREATE DATABASE spotsync OWNER spotsync;
\q
```

Create `backend\.env` with the following settings. Replace the example
database password and JWT secret with your own local values; do not commit this
file:

```dotenv
APP_PORT=8080
DATABASE_URL=postgres://spotsync:replace_with_local_password@localhost:5432/spotsync?sslmode=disable
JWT_SECRET=replace_with_a_long_random_local_secret
FRONTEND_URL=http://localhost:4321
TZ=Asia/Kolkata
```

### Start the backend

In the first terminal, from the repository root:

```powershell
Set-Location .\backend
go run .\cmd\api
```

The API listens on `http://localhost:8080`. On first startup it creates its
database tables and seeds the demo zones and users.

### Start the frontend

In a second terminal, also from the repository root, install frontend
dependencies once and start the development server:

```powershell
Set-Location .\frontend
npm ci
npm run dev
```

Open **http://localhost:4321** in your browser. Use `localhost` (not
`127.0.0.1`) so the browser origin matches `FRONTEND_URL` and API requests pass
the backend's CORS check.

To stop either server, press `Ctrl+C` in its terminal. The PostgreSQL service
can remain running. The API health check is at
`http://localhost:8080/health`.

---

## Repository Layout

```
Spotsync/
├── backend/
│   ├── api/
│   │   └── index.go              # Vercel serverless entry point
│   ├── cmd/api/
│   │   └── main.go               # Local `go run` entry point
│   ├── internal/
│   │   ├── config/               # Env loading + validation
│   │   ├── database/             # GORM connection + auto-migration
│   │   ├── dto/                  # Request/response structs
│   │   ├── handler/              # HTTP handlers (Echo)
│   │   ├── middleware/           # JWT auth + admin guard
│   │   ├── models/               # GORM models
│   │   ├── repository/           # Data access layer
│   │   ├── seeder/               # Zone + user seeders, rotator
│   │   ├── server/               # Echo wiring (sync.Once)
│   │   └── service/              # Business logic
│   ├── pkg/utils/                # JWT, password, validator, response helpers
│   ├── .air.toml                 # Hot reload config
│   ├── go.mod / go.sum
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── components/           # Astro + React components
│   │   ├── data/                 # Static seed data
│   │   ├── layouts/              # Layout shell
│   │   ├── lib/                  # Constants, formatting, toasts
│   │   ├── pages/                # Routes (index, login, register, admin/*)
│   │   ├── scripts/              # Client-side glue
│   │   ├── services/             # Fetch wrappers (api.ts, auth, etc.)
│   │   ├── store/                # Nano Stores (auth, theme)
│   │   ├── styles/               # globals.css
│   │   └── types/                # TypeScript contracts
│   ├── public/                   # favicon
│   ├── astro.config.mjs
│   ├── tailwind.config.mjs
│   ├── components.json
│   ├── package.json
│   └── .env
├── Project_Req.MD                # Original assignment spec
├── Backend.MD                    # Backend build notes
├── Frontend.MD                   # Frontend build notes
└── README.md                     # You are here
```

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Astro Frontend (port 4321)                       │
│   Static SSR + React islands · Tailwind · Nano Stores · Fetch wrapper        │
│                                                                              │
│   Pages:                                                                      │
│   /                  Home + zone catalog (SSR catalog render)                │
│   /login             Driver/admin login (React)                              │
│   /register          Self-service registration (React)                       │
│   /my-reservations   Driver booking history (Astro)                          │
│   /admin/*           Admin console (React): overview, drivers, users,         │
│                      reservations, zones                                     │
└──────────────────────────────────────────────────────────────────────────────┘
                                  │   HTTPS  · Bearer JWT · JSON
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       Go Backend (Echo  · port 8080)                         │
│   Clean Architecture:                                                         │
│   Handler ──► Service ──► Repository ──► GORM ──► PostgreSQL                  │
│        │                                                                     │
│        └── Echo middleware:  RequestLogger · Recover · CORS · JWT · Admin   │
│                                                                              │
│   Background goroutines:                                                      │
│     • Auto-migration (once)                                                   │
│     • Zone seeder (40 zones, idempotent)                                      │
│     • User seeder (admin + 2 drivers, idempotent)                            │
│     • ZoneRotator (every 1 hour, 60/40 split)                                │
└──────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                       ┌────────────────────────┐
                       │   PostgreSQL (Neon)    │
                       │   users · parking_zones│
                       │   reservations         │
                       └────────────────────────┘
```

The backend is dual-deployable: `cmd/api/main.go` is the long-running local server (used with `go run` or `air`), and `api/index.go` is the Vercel serverless shim that exports `Handler` and reuses the same Echo instance built once via `sync.Once`.

---

## Backend Architecture (Clean Layers)

The backend enforces a strict five-layer separation. Handlers never touch the database; Services never write SQL; Repositories never return JSON.

| Layer | Directory | Responsibility |
| --- | --- | --- |
| DTO | `internal/dto/` | Request payloads and response structures. Validate incoming JSON. Never expose GORM models directly. |
| Handler | `internal/handler/` | HTTP layer. Binds/validates DTOs, extracts JWT claims from Echo context, calls Service, returns JSON. |
| Service | `internal/service/` | Business logic. Hashes passwords, signs JWTs, enforces capacity rules, calls Repository. |
| Repository | `internal/repository/` | All GORM database operations (CRUD, transactions, row locks). |
| Model | `internal/models/` | GORM structs representing database tables. |

Manual dependency injection is performed in `internal/server/server.go`: `Repository → Service → Handler`, in that order. The `Handler` only ever talks to the `Service`, and the `Service` only ever talks to the `Repository`.

Middleware chain (request lifecycle):

1. `echomw.Logger()` — structured request/response log.
2. `echomw.Recover()` — panic-to-500 fallback.
3. `echomw.CORSWithConfig(...)` — restricted to `FRONTEND_URL`, never wildcard.
4. `AuthMiddleware(cfg.JWTSecret)` — validates `Authorization: Bearer <jwt>` and populates `auth_user_id`, `auth_role`, `auth_is_admin` on the Echo context.
5. `AdminOnly()` — rejects 403 for non-admin users on protected routes.

A central `CustomHTTPErrorHandler` wraps every error into a uniform JSON envelope (`{ "status": "error", "message": ..., "errors": ... }`) so the frontend can react predictably.

---

## Frontend Architecture

The frontend uses Astro's "static output + selective hydration" model:

- **Static Astro pages** handle the home page, layout, and admin frame. The home page server-renders the zone catalog into the first paint so visitors see real availability before any JS executes.
- **React islands** (`client:load` / `client:visible`) handle stateful surfaces: login, register, reservation modal, admin tables, profile settings, and the admin overview dashboard.
- **Nano Stores** (with `@nanostores/persistent`) hold the JWT token and the authenticated user in localStorage. The fetch wrapper reads the token on every request, so login/pull-token is automatic.
- **Service layer** (`src/services/*.ts`) wraps the API:
  - `api.ts` — generic `apiFetch` with token injection, envelope parsing, and `ApiError`.
  - `authService.ts`, `userService.ts`, `zoneService.ts`, `reservationService.ts`, `adminData.ts` — typed wrappers that mirror the backend DTOs.
- **Tailwind + Radix** power the UI primitives (Button, Card, Dialog, Input, Progress, Avatar, Badge, Table).
- **Theme store** (`themeStore.ts`) handles light/dark mode.

---

## Database Schema Design

The schema is owned by GORM models in `backend/internal/models/`. Auto-migration runs on every boot, so the tables and their constraints are always in sync with the structs.

### Table 1: `users`

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `bigserial` | PK, auto-increment | Unique account identifier |
| `name` | `varchar(100)` | NOT NULL | Display name |
| `email` | `varchar(150)` | UNIQUE, NOT NULL | Login / contact address |
| `password` | `varchar(255)` | NOT NULL | bcrypt hash (excluded from JSON) |
| `role` | `varchar(20)` | NOT NULL, default `'driver'` | One of `driver`, `admin`, `staff` |
| `created_at` | `timestamptz` | auto | Account creation timestamp |
| `updated_at` | `timestamptz` | auto | Last profile update timestamp |

### Table 2: `parking_zones`

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `bigserial` | PK, auto-increment | Unique zone identifier |
| `name` | `varchar(100)` | NOT NULL | Descriptive name (e.g., "Terminal 1 EV Charging") |
| `type` | `varchar(30)` | NOT NULL | One of `general`, `ev_charging`, `covered` |
| `total_capacity` | `integer` | NOT NULL | Maximum vehicles in this zone |
| `price_per_hour` | `numeric(10,2)` | NOT NULL | Hourly price in INR |
| `rotation_hold` | `integer` | NOT NULL, default `0` | Synthetic occupancy used by the ZoneRotator |
| `emergency_closed` | `boolean` | NOT NULL, default `false` | Incident-managed closure; never changed by the ZoneRotator |
| `created_at` | `timestamptz` | auto | Zone creation timestamp |
| `updated_at` | `timestamptz` | auto | Last zone update timestamp |

`available_spots` is **not** a stored column. It is computed by the repository on every read:

```
available_spots = 0, when emergency_closed
otherwise max(0, total_capacity - count(spot_holds == 1) - active_reservations - rotation_hold)
```

### Table 3: `reservations`

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `bigserial` | PK, auto-increment | Unique reservation identifier |
| `user_id` | `bigint` | NOT NULL, FK → `users(id)` ON DELETE CASCADE, INDEX | Booking driver |
| `zone_id` | `bigint` | NOT NULL, FK → `parking_zones(id)` ON DELETE CASCADE, INDEX | Booked zone |
| `license_plate` | `varchar(15)` | NOT NULL | Vehicle plate |
| `status` | `varchar(20)` | NOT NULL, default `'active'` | One of `active`, `completed`, `cancelled` |
| `created_at` | `timestamptz` | auto | Booking timestamp |
| `updated_at` | `timestamptz` | auto | Last status update timestamp |

### Entity Relationships

```
users (1) ──< (N) reservations (N) >── (1) parking_zones
```

Both foreign keys cascade on delete, so removing a user or a zone cleans up its reservations automatically.

Incident management adds `incidents`, `incident_events`, and `notifications` tables. Incidents reference the affected zone and reporting staff member; event records retain status-change history. Notifications belong to their recipient and incident, and a unique `(user_id, incident_id, event_key)` constraint prevents duplicate alerts when an operation is retried. Auto-migration creates these structures on backend startup without deleting existing data.

## REST API Reference

Base URL: `/api/v1`. All endpoints accept and return JSON. Protected endpoints require `Authorization: Bearer <jwt>`.

### Auth (public routes)

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | `{ name, email, password }` | `{ token, user }` (public sign-up always creates a driver; administrative roles must not be self-selected) |
| `POST` | `/auth/login` | `{ email, password }` | `{ token, user }` |

### Zones (public read)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/zones` | none | List all zones with live `available_spots` |
| `GET` | `/zones/:id` | none | Fetch one zone |
| `POST` | `/zones` | admin | Create a zone |
| `PUT` | `/zones/:id` | admin | Update a zone (partial fields allowed) |
| `DELETE` | `/zones/:id` | admin | Remove a zone |

### Reservations (authenticated)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/reservations/mine` | any user | List the caller's reservations |
| `GET` | `/reservations` | admin | List all reservations in the system |
| `GET` | `/reservations/:id` | any user | Fetch one reservation |
| `POST` | `/reservations` | any user | Create a reservation. Returns `409 Conflict` if the zone is full. |
| `PATCH` | `/reservations/:id/status` | any user | Update status to `active`, `completed`, or `cancelled` |
| `DELETE` | `/reservations/:id` | any user | Delete a reservation |
| | | | Zone closures are checked under the same row lock as reservation creation; closed zones return `409 Conflict`. |

### Incidents (admin or provisioned staff)

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/incidents` | Report an incident. Body: `{ zone_id, type, description, severity, closes_zone }`. The optional `Idempotency-Key` header makes retries safe. |
| `GET` | `/incidents` | List incident history; accepts `status`, `severity`, `type`, and `zone_id` filters. |
| `GET` | `/incidents/:id` | Retrieve incident details and audit history. |
| `PATCH` | `/incidents/:id/status` | Update status and resolution notes; resolving the last active closure reopens the zone. |
| `GET` | `/incidents/:id/affected-reservations` | List active reservations in the incident's zone. |

Incident types: `emergency_closure`, `blocked_space`, `vehicle_obstruction`, `maintenance`, `safety`, and `other`. Severities: `low`, `medium`, `high`, and `critical`. Statuses: `open`, `in_progress`, `resolved`, and `cancelled`.

### Driver notifications (authenticated)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/notifications/mine` | List only the caller's incident alerts. |
| `PATCH` | `/notifications/:id/read` | Mark one of the caller's notifications as read. |

The admin incident dashboard is `/admin/incidents`; drivers see parking alerts on `/my-reservations`. Emergency closures apply to a whole zone because the current reservation model has no individual spot identifiers. External email/SMS delivery is not configured.

### Manually verify incident workflow

1. Start PostgreSQL, the backend, and the Astro frontend using the Windows commands above.
2. Sign in as the seeded administrator at `/login` (`admin@spotsync.com`, `adminpassword`) and open `/admin/incidents`.
3. Sign in as a driver in another browser profile and create an active reservation in a zone that currently has capacity.
4. As the administrator, report a **Critical** `emergency_closure` incident for that zone. Confirm the zone's public availability becomes zero and the reservation endpoint rejects new bookings with `409`.
5. As the affected driver, open `/my-reservations` and confirm the alert appears. Mark it read and confirm it is no longer marked unread.
6. As the administrator, change the incident to **Resolved**, add resolution notes, and confirm the zone is available again (unless another active closure remains).

Staff accounts are not created through public registration. To provision a trusted staff account in a local development database, first create a regular account, then run `UPDATE users SET role = 'staff' WHERE email = 'trusted-staff@example.com';` using an authorized PostgreSQL administrator. Never expose a role-change operation through public signup.

### Auth roster (admin only)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/auth/users` | List users |
| `GET` | `/auth/users/count` | Count users grouped by role |
| `DELETE` | `/auth/users/:id` | Delete a user |

### Health

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Returns `{ "status": "UP" }` (always available, even when DB is down) |



## Background Jobs — Zone Rotator

To keep the catalog feeling alive in the demo and in production, a `ZoneRotator` goroutine runs every hour and enforces a 60/40 available/full split across the 40 zones:

- It does **not** touch the `reservations` table.
- It mutates `parking_zones.rotation_hold` instead, so `available_spots` is recomputed naturally.
- On each tick it (1) flips enough zones to hit the target split, and (2) when the split already matches, swaps a few zones between buckets so the visible state changes every hour.
- The first rotation runs immediately on boot so a fresh server doesn't show all-100% availability.
- The goroutine is cancelled via the server's lifecycle context, so it exits cleanly on shutdown.

---

## Authentication & Authorization

- **JWT Flow** — credentials are POSTed to `/auth/login`, bcrypt-hashed passwords are compared, and on success a signed JWT is returned. The client persists it in `localStorage` (`spotsync_token`) and attaches it as `Authorization: Bearer <token>` on every subsequent request.
- **Token claims** — `user_id` and `role` are injected into the Echo context via `AuthMiddleware`.
- **Security rules** —
  - Passwords are never exposed in JSON (`json:"-"` on the `User` model).
  - `JWT_SECRET` is required at boot; the server refuses to start without it.
  - Protected routes return `401 Unauthorized` on missing/expired/invalid tokens.
  - Admin-only routes return `403 Forbidden` for non-admin tokens.
  - CORS is restricted to `FRONTEND_URL` (never wildcard), so credentials are accepted.


---

## Seeded Demo Accounts

On a fresh database the user seeder inserts (and self-heals) the following accounts:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@spotsync.com` | `adminpassword` |
| Driver | `john@spotsync.com` | `password123` |
| Driver | `jane@spotsync.com` | `password123` |

The login page exposes quick-fill buttons for these credentials so the demo works out of the box. The zone seeder also pre-populates 40 zones across the three types (`general`, `ev_charging`, `covered`) so the catalog never starts empty.


## Acknowledgements

- [Echo](https://echo.labstack.com/) — minimalist Go web framework.
- [GORM](https://gorm.io/) — Go ORM with PostgreSQL support.
- [Astro](https://astro.build/) — the all-in-one web framework.
- [Radix UI](https://www.radix-ui.com/) — unstyled, accessible UI primitives.
- [Neon](https://neon.tech/) — serverless PostgreSQL used in production.
