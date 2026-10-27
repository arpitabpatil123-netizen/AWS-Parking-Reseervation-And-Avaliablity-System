// Package server initializes the Echo HTTP application exactly once,
// sharing the same instance between the local `go run` entry point
// (`cmd/api/main.go`) and the Vercel serverless entry point
// (`api/index.go`).
//
// Keeping initialization in a package that is NOT `main` is important:
// a `main` package cannot be imported by other Go packages, but Vercel's
// Go runtime needs to import the entry file and read the exported
// `Handler` symbol from it.
package server

import (
	"context"
	"log"
	"net/http"
	"sync"
	"time"
	_ "time/tzdata"

	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"

	"spotsync-backend/internal/config"
	"spotsync-backend/internal/database"
	"spotsync-backend/internal/handler"
	"spotsync-backend/internal/middleware"
	"spotsync-backend/internal/repository"
	"spotsync-backend/internal/seeder"
	"spotsync-backend/internal/service"
	"spotsync-backend/pkg/utils"
)

var (
	once sync.Once
	app  *echo.Echo
)

// Get returns the initialized Echo instance, building it on the first
// call. Subsequent calls return the same instance so the database
// connection pool and registered routes are reused across serverless
// invocations.
func Get() *echo.Echo {
	once.Do(build)
	return app
}

// build wires up the Echo application: config, middleware, routes, and
// the database connection. It is called once via `sync.Once`. Even when
// the database is unreachable the Echo app is still constructed (with a
// `/health` endpoint and a stub error handler) so the serverless
// function returns meaningful HTTP responses instead of nil-panicking
// on every invocation.
func build() {
	location, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		log.Printf("ERROR: Failed to load Asia/Kolkata timezone: %v; using fixed IST offset", err)
		location = time.FixedZone("Asia/Kolkata", 5*60*60+30*60)
	}
	time.Local = location

	// 1. Load configuration. On Vercel we never `log.Fatalf` because that
	// would terminate the serverless instance before it can respond; we
	// just log the failure and keep an empty Config so the app still
	// answers /health for the load balancer. We deliberately do NOT
	// hardcode any fallback secret here — any request that reaches the
	// JWT middleware without a loaded config will be rejected.
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Printf("ERROR: Failed to load configuration: %v", err)
		log.Println("Server will boot in degraded mode: only /health will respond. JWT and DB endpoints will fail.")
		cfg = &config.Config{}
	}

	// 2. Initialize Echo
	e := echo.New()
	e.HideBanner = true
	e.HidePort = true
	e.Validator = utils.NewValidator()

	// Central HTTP error handler — wraps all errors (route 404s, validation
	// failures, panic recoveries, manually thrown errors) into our standard
	// JSON envelope. Must be attached BEFORE the server starts accepting
	// traffic.
	e.HTTPErrorHandler = utils.CustomHTTPErrorHandler

	// Echo's router short-circuits to the package-level `echo.NotFoundHandler`
	// for missing routes (the HTTPErrorHandler chain IS still invoked when
	// that handler returns an error, but we override the message here so it
	// is friendlier than Echo's default empty `*HTTPError`).
	echo.NotFoundHandler = func(c echo.Context) error {
		return echo.NewHTTPError(http.StatusNotFound, "The requested resource was not found")
	}

	// Step 7 middleware: logging, panic recovery, and CORS so the frontend
	// can call the API with credentials and the standard Authorization /
	// Content-Type headers. Allowed origin is restricted to the Astro
	// frontend URL loaded from FRONTEND_URL — never use "*" because browsers
	// refuse to send credentials / Authorization headers with wildcard CORS.
	e.Use(echomw.Logger())
	e.Use(echomw.Recover())
	e.Use(echomw.CORSWithConfig(echomw.CORSConfig{
		AllowOrigins: []string{cfg.FrontendURL},
		AllowHeaders: []string{
			echo.HeaderOrigin,
			echo.HeaderContentType,
			echo.HeaderAccept,
			echo.HeaderAuthorization,
		},
		AllowMethods: []string{
			http.MethodGet,
			http.MethodPost,
			http.MethodPut,
			http.MethodDelete,
			http.MethodPatch,
			http.MethodOptions,
		},
	}))

	// 3. Health check route (public) — always available, even if the
	// database is down. Useful for Vercel/load-balancer health probes.
	// Both GET and HEAD are wired because the in-image HEALTHCHECK uses
	// wget --spider, which on wget 1.21.x always issues HEAD regardless
	// of any --method flag (known upstream behaviour).
	e.GET("/health", healthHandler)
	e.HEAD("/health", healthHandler)

	// 4. Connect to the database. We do this BEFORE the server starts so the
	// route registration block below can be entered when the connection is
	// healthy. Auto-migration is run in a background goroutine because it can
	// be slow on remote databases (e.g. Neon) and we don't want it to delay
	// the HTTP server start.
	db, err := database.ConnectDB(cfg)
	if err != nil {
		log.Printf("WARNING: Database connection failed: %v", err)
		log.Println("Server will continue running but DB-dependent endpoints will not work.")
		// Still expose the health endpoint so Vercel invocations return
		// something useful instead of crashing on a nil DB.
		app = e
		return
	}

	// Repositories
	userRepo := repository.NewUserRepository(db)
	zoneRepo := repository.NewZoneRepository(db)
	reservationRepo := repository.NewReservationRepository(db)

	// Services
	authService := service.NewAuthService(userRepo, cfg.JWTSecret)
	zoneService := service.NewZoneService(zoneRepo)
	reservationService := service.NewReservationService(reservationRepo)

	// Handlers
	authHandler := handler.NewAuthHandler(authService)
	zoneHandler := handler.NewZoneHandler(zoneService)
	reservationHandler := handler.NewReservationHandler(reservationService)

	// Run GORM auto-migrations in the background so the server can
	// accept traffic immediately.
	go func() {
		if err := database.AutoMigrate(db); err != nil {
			log.Printf("WARNING: Auto-migration failed: %v", err)
			return
		}
		log.Println("Database migrations applied successfully")

		// Seed the catalog to 40 zones if needed. Safe to run multiple
		// times — only inserts when the catalog is below target.
		if inserted, err := seeder.SeedIfNeeded(db); err != nil {
			log.Printf("WARNING: Zone seeder failed: %v", err)
		} else if inserted > 0 {
			log.Printf("Zone seeder inserted %d new zones", inserted)
		}

		// Seed the default demo user accounts (admin + drivers) so the
		// published credentials on the login page work out of the box.
		if inserted, err := seeder.SeedUsersIfNeeded(db); err != nil {
			log.Printf("WARNING: User seeder failed: %v", err)
		} else if inserted > 0 {
			log.Printf("User seeder inserted %d demo accounts", inserted)
		}

		// Boot the 1-hour rotation worker. The rotator is cancelled via
		// the server shutdown context so its goroutine exits cleanly.
		rotator := seeder.NewZoneRotator(db, 0) // 0 -> use default (1 hour)
		rotator.Start(context.Background())
	}()

	// --- Public auth routes ---
	authGroup := e.Group("/api/v1/auth")
	authGroup.POST("/register", authHandler.Register)
	authGroup.POST("/login", authHandler.Login)

	// --- Public zone catalog (browsing does not require auth) ---
	// Per Backend.MD Step 5: GET /zones and /zones/:id are public so the
	// frontend can render availability without forcing a login.
	e.GET("/api/v1/zones", zoneHandler.List)
	e.GET("/api/v1/zones/:id", zoneHandler.GetByID)

	// --- Authenticated routes ---
	auth := middleware.AuthMiddleware(cfg.JWTSecret)

	// Admin-only auth routes (user roster). Mounted under the same /auth
	// group but guarded by JWT + admin role.
	adminAuthGroup := e.Group("/api/v1/auth", auth, middleware.AdminOnly())
	adminAuthGroup.GET("/users", authHandler.ListUsers)
	adminAuthGroup.GET("/users/count", authHandler.CountUsersByRole)
	adminAuthGroup.DELETE("/users/:id", authHandler.DeleteUser)

	// Zone mutations are admin-only.
	zoneGroup := e.Group("/api/v1/zones", auth)
	zoneGroup.POST("", zoneHandler.Create, middleware.AdminOnly())
	zoneGroup.PUT("/:id", zoneHandler.Update, middleware.AdminOnly())
	zoneGroup.DELETE("/:id", zoneHandler.Delete, middleware.AdminOnly())

	// Reservations: any authenticated user can manage their own; admins
	// can see/modify all.
	reservationGroup := e.Group("/api/v1/reservations", auth)
	reservationGroup.GET("/mine", reservationHandler.ListMine)
	reservationGroup.GET("", reservationHandler.ListAll, middleware.AdminOnly())
	reservationGroup.GET("/:id", reservationHandler.GetByID)
	reservationGroup.POST("", reservationHandler.Create)
	reservationGroup.PATCH("/:id/status", reservationHandler.UpdateStatus)
	reservationGroup.DELETE("/:id", reservationHandler.Delete)

	app = e
}

// healthHandler responds 200 with a small JSON body. Wired to both
// GET and HEAD so the in-image wget --spider HEALTHCHECK (which
// always sends HEAD on wget 1.21.x) succeeds.
func healthHandler(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{"status": "UP"})
}
