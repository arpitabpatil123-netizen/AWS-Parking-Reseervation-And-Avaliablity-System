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

// RotateOnce performs a single rotation cycle. Exposed so tests and
// the auto-migration hook can trigger a rotation on demand.
//
// Algorithm:
//  1. Load every zone.
//  2. Bucket into [available, full] based on rotation_hold == 0.
//  3. Compute the target counts (60% available, 40% full).
//  4. Move zones between buckets to hit the target.
//  5. Persist with a single UPDATE.
func (r *ZoneRotator) RotateOnce() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	var zones []models.ParkingZone
	if err := r.db.Select("id", "total_capacity", "rotation_hold").
		Order("id ASC").
		Find(&zones).Error; err != nil {
		return err
	}
	if len(zones) == 0 {
		return nil
	}

	availableTarget := int(float64(len(zones)) * availablePercent)
	fullTarget := len(zones) - availableTarget

	// Split into buckets. A zone is "available" when its rotation_hold
	// is zero (the natural state). It is "full" when rotation_hold
	// equals total_capacity (the rotator-blocked state).
	var available []models.ParkingZone
	var full []models.ParkingZone
	for _, z := range zones {
		if z.RotationHold == 0 {
			available = append(available, z)
		} else {
			full = append(full, z)
		}
	}

	// Shuffle both buckets so the swap is non-deterministic.
	r.shuffleLocked(available)
	r.shuffleLocked(full)

	// Move zones to hit the target counts.
	needMoreAvailable := availableTarget - len(available)
	if needMoreAvailable > 0 {
		// Flip some full zones -> available.
		n := minInt(needMoreAvailable, len(full))
		for i := 0; i < n; i++ {
			full[i].RotationHold = 0
			available = append(available, full[i])
		}
		full = full[n:]
	}
	needMoreFull := fullTarget - len(full)
	if needMoreFull > 0 {
		// Flip some available zones -> full.
		n := minInt(needMoreFull, len(available))
		for i := 0; i < n; i++ {
			available[i].RotationHold = available[i].TotalCapacity
			full = append(full, available[i])
		}
		available = available[n:]
	}

	// When the split already matches, swap a few zones between buckets
	// so the visible state changes every hour.
	if needMoreAvailable == 0 && needMoreFull == 0 {
		swapCount := minInt(4, minInt(len(available), len(full)))
		for i := 0; i < swapCount; i++ {
			available[i].RotationHold = available[i].TotalCapacity
			full[i].RotationHold = 0
		}
	}

	// Persist the changes in a single bulk UPDATE per zone. We do
	// per-row updates instead of CASE WHEN because the column count
	// is small (40) and the per-row approach is easier to reason about
	// under errors.
	updates := append(append([]models.ParkingZone{}, available...), full...)
	for _, z := range updates {
		if err := r.db.Model(&models.ParkingZone{}).
			Where("id = ?", z.ID).
			Update("rotation_hold", z.RotationHold).Error; err != nil {
			return err
		}
	}

	availCount := len(available)
	log.Printf("[rotator] %d zones available / %d full (target: %d/%d)",
		availCount, len(full), availableTarget, fullTarget)

	// Per spec §3.6: every hourly tick reshuffles which specific spot
	// positions are held. This runs on every tick (regardless of whether
	// the 60/40 zone-level split actually flipped) so the visible
	// per-spot grid churns hourly.
	//
	// Note: RegenerateSpotHolds uses math/rand/v2 internally, which is
	// safe for concurrent use, so we don't need to share r.mu with it.
	for _, z := range zones {
		if err := RegenerateSpotHolds(r.db, z.ID); err != nil {
			return err
		}
	}

	return nil
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
