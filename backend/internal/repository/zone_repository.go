package repository

import (
	"errors"
	"time"

	"github.com/lib/pq"
	"gorm.io/gorm"

	"spotsync-backend/internal/dto"
	"spotsync-backend/internal/models"
	"spotsync-backend/internal/seeder"
)

// ZoneRepository defines the persistence contract for ParkingZone records.
type ZoneRepository interface {
	Create(zone *models.ParkingZone) error
	FindByID(id uint) (*models.ParkingZone, error)
	List() ([]models.ParkingZone, error)
	Update(zone *models.ParkingZone) error
	Delete(id uint) error
	CountActiveReservations(zoneID uint) (int64, error)
	FindAllWithAvailability() ([]dto.ZoneResponse, error)
	FindByIDWithAvailability(id uint) (*dto.ZoneResponse, error)
	// RegenerateSpotHolds replaces a zone's spot_holds with a fresh
	// random array of length total_capacity. See seeder.spot_holds.go
	// for the algorithm.
	RegenerateSpotHolds(zoneID uint) error
	// EnsureSpotHoldsLength backfills spot_holds if its length does not
	// match total_capacity. Idempotent; cheap when already correct.
	EnsureSpotHoldsLength(zoneID uint) error
}

type zoneRepository struct {
	db *gorm.DB
}

// NewZoneRepository wires a ZoneRepository backed by the given GORM DB.
func NewZoneRepository(db *gorm.DB) ZoneRepository {
	return &zoneRepository{db: db}
}

// parseTime accepts the various textual representations that the postgres
// driver can return for timestamp columns and parses them into time.Time.
// An empty string yields the zero time and a nil error.
func parseTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999-07",
		"2006-01-02 15:04:05.999999",
		"2006-01-02 15:04:05-07",
		"2006-01-02 15:04:05",
	}
	var lastErr error
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		} else {
			lastErr = err
		}
	}
	if lastErr == nil {
		return time.Time{}, errors.New("unrecognized time format")
	}
	return time.Time{}, lastErr
}

func (r *zoneRepository) Create(zone *models.ParkingZone) error {
	return r.db.Create(zone).Error
}

func (r *zoneRepository) FindByID(id uint) (*models.ParkingZone, error) {
	var zone models.ParkingZone
	if err := r.db.First(&zone, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	return &zone, nil
}

func (r *zoneRepository) List() ([]models.ParkingZone, error) {
	var zones []models.ParkingZone
	if err := r.db.Order("id ASC").Find(&zones).Error; err != nil {
		return nil, err
	}
	return zones, nil
}

func (r *zoneRepository) Update(zone *models.ParkingZone) error {
	return r.db.Save(zone).Error
}

func (r *zoneRepository) Delete(id uint) error {
	return r.db.Delete(&models.ParkingZone{}, id).Error
}

// CountActiveReservations returns the count of active reservations for the
// given zone. Used to enforce capacity checks.
func (r *zoneRepository) CountActiveReservations(zoneID uint) (int64, error) {
	var count int64
	if err := r.db.Model(&models.Reservation{}).
		Where("zone_id = ? AND status = ?", zoneID, "active").
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

// FindAllWithAvailability returns every parking zone with a dynamically
// computed AvailableSpots value:
//
//	available_spots = total_capacity
//	                   - (number of 1s in spot_holds)
//	                   - COUNT(active_reservations)
//	                   - rotation_hold
//
// The `spot_holds` column is the per-spot bitmap managed by the seeder
// (see internal/seeder/spot_holds.go): a presentation-only simulation
// layer that reserves a random subset of spots in each zone. Held spots
// are additive to real reservations and block new bookings until the
// next regeneration (zone create/capacity change / hourly rotation).
//
// IMPORTANT: the held count is the number of array elements equal to 1,
// NOT array_length(spot_holds, 1). array_length returns the dimension
// length of the array (which always equals total_capacity for a fully
// populated bitmap), and using it would subtract total_capacity from
// itself, always yielding 0 available spots.
//
// The `rotation_hold` column is owned by the ZoneRotator (see
// internal/seeder/rotator.go) and is used to mark a zone as "full" for
// display purposes without inserting fake rows into the reservations
// table.
//
// The availability calculation is performed in a single SQL query using a
// correlated subquery against the reservations table, so callers do not need
// to do an N+1 lookup.
func (r *zoneRepository) FindAllWithAvailability() ([]dto.ZoneResponse, error) {
	type row struct {
		ID             uint          `gorm:"column:id"`
		Name           string        `gorm:"column:name"`
		Type           string        `gorm:"column:type"`
		TotalCapacity  int           `gorm:"column:total_capacity"`
		AvailableSpots int           `gorm:"column:available_spots"`
		PricePerHour   float64       `gorm:"column:price_per_hour"`
		SpotHolds      pq.Int64Array `gorm:"column:spot_holds"`
		CreatedAt      string        `gorm:"column:created_at"`
		UpdatedAt      string        `gorm:"column:updated_at"`
	}

	var rows []row
	err := r.db.
		Table("parking_zones pz").
		Select(`pz.id, pz.name, pz.type, pz.total_capacity,
		        GREATEST(0, pz.total_capacity
		            - (SELECT COUNT(*) FROM unnest(pz.spot_holds) AS s(hold) WHERE s.hold = 1)
		            - (SELECT COUNT(*) FROM reservations r
		                WHERE r.zone_id = pz.id AND r.status = 'active')
		            - pz.rotation_hold
		        ) AS available_spots,
		        pz.price_per_hour, pz.spot_holds,
		        pz.created_at, pz.updated_at`).
		Order("pz.id ASC").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	out := make([]dto.ZoneResponse, 0, len(rows))
	for _, r := range rows {
		z := dto.ZoneResponse{
			ID:             r.ID,
			Name:           r.Name,
			Type:           r.Type,
			TotalCapacity:  r.TotalCapacity,
			AvailableSpots: r.AvailableSpots,
			PricePerHour:   r.PricePerHour,
			SpotHolds:      []int64(r.SpotHolds),
		}
		if t, err := parseTime(r.CreatedAt); err == nil {
			z.CreatedAt = t
		}
		if t, err := parseTime(r.UpdatedAt); err == nil {
			z.UpdatedAt = t
		}
		out = append(out, z)
	}
	return out, nil
}

// FindByIDWithAvailability returns a single parking zone with its dynamically
// computed AvailableSpots. Returns gorm.ErrRecordNotFound when the zone
// does not exist.
func (r *zoneRepository) FindByIDWithAvailability(id uint) (*dto.ZoneResponse, error) {
	type row struct {
		ID             uint          `gorm:"column:id"`
		Name           string        `gorm:"column:name"`
		Type           string        `gorm:"column:type"`
		TotalCapacity  int           `gorm:"column:total_capacity"`
		AvailableSpots int           `gorm:"column:available_spots"`
		PricePerHour   float64       `gorm:"column:price_per_hour"`
		SpotHolds      pq.Int64Array `gorm:"column:spot_holds"`
		CreatedAt      string        `gorm:"column:created_at"`
		UpdatedAt      string        `gorm:"column:updated_at"`
	}

	var r0 row
	err := r.db.
		Table("parking_zones pz").
		Select(`pz.id, pz.name, pz.type, pz.total_capacity,
		        GREATEST(0, pz.total_capacity
		            - (SELECT COUNT(*) FROM unnest(pz.spot_holds) AS s(hold) WHERE s.hold = 1)
		            - (SELECT COUNT(*) FROM reservations r
		                WHERE r.zone_id = pz.id AND r.status = 'active')
		            - pz.rotation_hold
		        ) AS available_spots,
		        pz.price_per_hour, pz.spot_holds,
		        pz.created_at, pz.updated_at`).
		Where("pz.id = ?", id).
		Scan(&r0).Error
	if err != nil {
		return nil, err
	}
	// GORM Scan does not return ErrRecordNotFound automatically. Detect
	// "no row" via zero-value ID combined with the requested id.
	if r0.ID == 0 {
		return nil, gorm.ErrRecordNotFound
	}

	z := &dto.ZoneResponse{
		ID:             r0.ID,
		Name:           r0.Name,
		Type:           r0.Type,
		TotalCapacity:  r0.TotalCapacity,
		AvailableSpots: r0.AvailableSpots,
		PricePerHour:   r0.PricePerHour,
		SpotHolds:      []int64(r0.SpotHolds),
	}
	if t, err := parseTime(r0.CreatedAt); err == nil {
		z.CreatedAt = t
	}
	if t, err := parseTime(r0.UpdatedAt); err == nil {
		z.UpdatedAt = t
	}
	return z, nil
}

// RegenerateSpotHolds replaces a zone's spot_holds with a fresh random
// array of length total_capacity. Thin wrapper that delegates to the
// seeder package where the algorithm lives. Used by the service on
// zone create and on capacity-changing updates.
//
// See seeder.RegenerateSpotHolds for the full algorithm description.
func (r *zoneRepository) RegenerateSpotHolds(zoneID uint) error {
	return seeder.RegenerateSpotHolds(r.db, zoneID)
}

// EnsureSpotHoldsLength backfills a zone's spot_holds when its length
// does not match total_capacity. Called on every catalog read so
// legacy rows self-heal on first access. Returns nil if no backfill
// is required.
//
// See seeder.EnsureSpotHoldsLength for the full algorithm description.
func (r *zoneRepository) EnsureSpotHoldsLength(zoneID uint) error {
	return seeder.EnsureSpotHoldsLength(r.db, zoneID)
}