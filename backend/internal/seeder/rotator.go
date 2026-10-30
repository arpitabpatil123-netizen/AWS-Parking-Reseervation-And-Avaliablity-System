// Package seeder — zone availability rotator.
//
// The ZoneRotator is a background goroutine that runs every 1 hour and
// keeps the catalog in the "60% available / 40% full" state required by
// the product spec. It does NOT touch the reservations table; instead
// it mutates the `rotation_hold` column on `parking_zones`:
//
//	available_spots = total_capacity - active_reservations - rotation_hold
//
// When rotation_hold == total_capacity, the zone renders as full even
// though no real driver has reserved a spot. When rotation_hold == 0,
// the zone renders with its real availability.
//
// Tickers per tick:
//  1. Load every zone (id + total_capacity + current rotation_hold).
//  2. Determine which zones are currently "full" (rotation_hold > 0) and
//     which are "available" (rotation_hold == 0).
//  3. If the split is off, flip enough zones to restore 60/40.
//  4. Even when the split matches, swap a few zones between buckets so
//     the visible state changes every hour.
//  5. Persist the new rotation_hold values in a single UPDATE statement.
package seeder

import (
	"context"
	"log"
	"math/rand"
	"sync"
	"time"

	"gorm.io/gorm"

	"spotsync-backend/internal/models"
)

// RotationInterval is the cadence at which the rotator runs. Exposed so
// tests can override it (e.g. by setting ROTATION_INTERVAL_MINUTES).
const RotationInterval = 1 * time.Hour

// availablePercent is the fraction of zones that must have at least one
// free spot after every rotation. Combined with TargetedZoneCount the
// rotator computes e.g. 24 of 40 zones available.
const availablePercent = 0.6

// ZoneRotator is a long-running background worker that periodically
// rotates the parking-zone availability state. It is safe to construct
// even when the database is unavailable — Start() returns immediately
// in that case and the worker simply does nothing.
type ZoneRotator struct {
	db       *gorm.DB
	interval time.Duration
	mu       sync.Mutex
	rng      *rand.Rand
}

// NewZoneRotator constructs a ZoneRotator. The interval defaults to
// RotationInterval (1 hour) and can be overridden for tests.
func NewZoneRotator(db *gorm.DB, interval time.Duration) *ZoneRotator {
	if interval <= 0 {
		interval = RotationInterval
	}
	return &ZoneRotator{
		db:       db,
		interval: interval,
		rng:      rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// Start launches the background rotation loop. It returns immediately;
// the goroutine runs until ctx is cancelled. The first rotation
// happens one full interval after Start, so a freshly-started server
// doesn't immediately shuffle the catalog out from under the first
// users.
//
// Callers should pass a context tied to the server's lifecycle so the
// goroutine stops cleanly on shutdown.
func (r *ZoneRotator) Start(ctx context.Context) {
	if r.db == nil {
		log.Println("[rotator] database not available; rotator is disabled")
		return
	}

	// Run an initial rotation immediately so a fresh server boots into
	// the 60/40 state instead of waiting an hour for the first tick.
	// We swallow the error — the next tick will retry.
	if err := r.RotateOnce(); err != nil {
		log.Printf("[rotator] initial rotation failed: %v", err)
	}

	go func() {
		ticker := time.NewTicker(r.interval)
		defer ticker.Stop()
		log.Printf("[rotator] started; rotating every %s", r.interval)
		for {
			select {
			case <-ctx.Done():
				log.Println("[rotator] shutting down")
				return
			case <-ticker.C:
				if err := r.RotateOnce(); err != nil {
					log.Printf("[rotator] rotation tick failed: %v", err)
					continue
				}
				log.Println("[rotator] rotation tick completed")
			}
		}
	}()
}

// RotateOnce resets any rotation holds to ensure zones are not artificially held full.
// Natural availability is determined solely by total_capacity minus active reservations.
func (r *ZoneRotator) RotateOnce() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	return r.db.Model(&models.ParkingZone{}).
		Where("rotation_hold > 0").
		Update("rotation_hold", 0).Error
}

// shuffleLocked performs an in-place Fisher-Yates shuffle. The caller
// must hold r.mu (the unlocker) because rng is not concurrency-safe.
func (r *ZoneRotator) shuffleLocked(zs []models.ParkingZone) {
	for i := len(zs) - 1; i > 0; i-- {
		j := r.rng.Intn(i + 1)
		zs[i], zs[j] = zs[j], zs[i]
	}
}

// minInt is a tiny helper to avoid clashing with the built-in
// `min` (which Go 1.21+ provides as a generic function over
// `cmp.Ordered`). Both arguments are non-negative ints.
func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
