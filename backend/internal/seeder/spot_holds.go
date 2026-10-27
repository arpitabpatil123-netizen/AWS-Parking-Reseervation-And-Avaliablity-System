// Package seeder — per-spot availability helpers.
//
// The spot_holds layer models per-spot reservation as a bitmap on the
// parking_zones table. Each element of spot_holds is 0 (available) or 1
// (held/reserved). The held slots are *additive* to real reservations:
// they consume against available_spots and block new reservations but
// do not appear in /reservations/mine.
//
// Held range per the product spec:
//   - For a zone of N spots, holdCount ∈ [floor(N/2), ceil(N*0.6)]
//     (i.e. roughly half to 60% held, leaving 40-50% available).
//   - For N=18 this gives 9-11 spots held, leaving 7-9 available.
//   - The exact held positions are random and persist until something
//     explicitly changes them (real reservation, rotation tick, admin
//     action).
//
// Randomness is sourced from math/rand/v2 which is safe for concurrent
// use as of Go 1.22, so these helpers can be invoked from the HTTP
// request goroutine (Create / Update) and the background rotator
// goroutine without any additional locking.
package seeder

import (
	"math"
	"math/rand/v2"

	"github.com/lib/pq"
	"gorm.io/gorm"

	"spotsync-backend/internal/models"
)

// holdPercentLow is the lower bound on the fraction of total_capacity
// that must be held (random within the band).
const holdPercentLow = 0.5

// holdPercentHigh is the upper bound on the fraction of total_capacity
// that must be held (random within the band).
const holdPercentHigh = 0.6

// RegenerateSpotHolds replaces a zone's spot_holds with a fresh random
// array of length total_capacity. The number of held positions is
// randomly chosen in [floor(N*0.5), ceil(N*0.6)]; the specific positions
// are chosen via Fisher-Yates shuffle then the first holdCount entries
// are flipped to 1.
//
// Called from:
//   - zone_service.Create (fresh zones on insert)
//   - zone_service.Update (only when total_capacity changes)
//   - zone_seeder.SeedIfNeeded (fresh DB seed)
//   - ZoneRotator.RotateOnce (every 1h, regardless of zone-level flip)
//
// Idempotent: re-running produces a fresh independent random array.
func RegenerateSpotHolds(db *gorm.DB, zoneID uint) error {
	var z models.ParkingZone
	if err := db.Select("id", "total_capacity", "spot_holds").
		First(&z, zoneID).Error; err != nil {
		return err
	}
	holds := generateSpotHolds(z.TotalCapacity)
	return db.Model(&models.ParkingZone{}).
		Where("id = ?", zoneID).
		Update("spot_holds", pq.Array(holds)).Error
}

// EnsureSpotHoldsLength backfills a zone's spot_holds when its length
// does not match total_capacity. Used on every catalog read so legacy
// rows (created before the column existed) self-heal on first access.
//
// Per spec §6.1: never throws if regeneration is needed — just
// regenerates and persists. Returns only DB-level errors.
func EnsureSpotHoldsLength(db *gorm.DB, zoneID uint) error {
	var z models.ParkingZone
	if err := db.Select("id", "total_capacity", "spot_holds").
		First(&z, zoneID).Error; err != nil {
		return err
	}
	if len(z.SpotHolds) == z.TotalCapacity {
		return nil
	}
	return RegenerateSpotHolds(db, zoneID)
}

// generateSpotHolds builds a randomized spot_holds slice of length n
// with holdCount entries set to 1 and the rest set to 0, where
// holdCount ∈ [floor(n*0.5), ceil(n*0.6)].
//
// Algorithm (per spec §3.3):
//  1. Build []int64 of length n, initialised to all 1s.
//  2. Fisher-Yates shuffle in place.
//  3. Flip the first (n - holdCount) entries to 0.
//
// For n=0 the result is an empty slice.
func generateSpotHolds(n int) []int64 {
	if n <= 0 {
		return []int64{}
	}

	lo := int(math.Floor(float64(n) * holdPercentLow))
	hi := int(math.Ceil(float64(n) * holdPercentHigh))
	if hi > n {
		hi = n
	}
	if hi < lo {
		hi = lo
	}
	// holdCount is the *number of held* positions. Random within [lo, hi].
	holdCount := lo + rand.IntN(hi-lo+1)

	holds := make([]int64, n)
	for i := range holds {
		holds[i] = 1
	}

	// Fisher-Yates in-place shuffle.
	for i := len(holds) - 1; i > 0; i-- {
		j := rand.IntN(i + 1)
		holds[i], holds[j] = holds[j], holds[i]
	}

	// Flip the first (n - holdCount) to 0. The remaining entries stay 1.
	availableCount := n - holdCount
	if availableCount < 0 {
		availableCount = 0
	}
	for i := 0; i < availableCount; i++ {
		holds[i] = 0
	}

	return holds
}
