package repository

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"spotsync-backend/internal/models"
)

// Sentinel errors returned by the reservation repository. They are mapped to
// HTTP status codes by the service / handler layers.
var (
	// ErrZoneNotFoundInTx is returned when the requested parking zone does not
	// exist inside the reservation-creation transaction.
	ErrZoneNotFoundInTx = errors.New("parking zone not found")
	// ErrZoneFull is returned when the parking zone has reached its total
	// capacity and cannot accept any more active reservations.
	ErrZoneFull = errors.New("parking zone is full")
)

// ReservationRepository defines the persistence contract for Reservation records.
type ReservationRepository interface {
	Create(reservation *models.Reservation) error
	// CreateWithCapacityCheck atomically inserts a new reservation while
	// enforcing the zone's capacity limit using a row-level FOR UPDATE lock
	// on the parking zone record. This is the *safe* path used by the
	// reservation flow and prevents the classic "last EV spot" race
	// condition under concurrent load.
	CreateWithCapacityCheck(userID uint, zoneID uint, licensePlate string) (*models.Reservation, error)
	FindByID(id uint) (*models.Reservation, error)
	ListByUser(userID uint) ([]models.Reservation, error)
	ListAll() ([]models.Reservation, error)
	Update(reservation *models.Reservation) error
	Delete(id uint) error
}

type reservationRepository struct {
	db *gorm.DB
}

// NewReservationRepository wires a ReservationRepository backed by the given
// GORM DB.
func NewReservationRepository(db *gorm.DB) ReservationRepository {
	return &reservationRepository{db: db}
}

func (r *reservationRepository) Create(reservation *models.Reservation) error {
	return r.db.Create(reservation).Error
}

// CreateWithCapacityCheck performs the reservation creation inside a single
// database transaction with row-level locking on the parking zone record.
//
// Flow:
//  1. BEGIN transaction.
//  2. SELECT ... FOR UPDATE on the parking_zones row identified by zoneID. This
//     blocks any other concurrent transaction that tries to read the same
//     row until our transaction commits or rolls back, guaranteeing a
//     serialized capacity check.
//  3. COUNT active reservations for the zone (inside the same tx, so the
//     committed count is what we see).
//  4. If activeCount + holdCount >= total_capacity, return ErrZoneFull.
//     `holdCount` is the number of held positions (entries equal to 1)
//     in spot_holds; held spots are additive to real reservations and are
//     truly off-limits for booking. NOTE: it is NOT len(z.SpotHolds),
//     which would always equal total_capacity and wrongly reject every
//     reservation the moment spot_holds is populated. The caller maps
//     ErrZoneFull to HTTP 409 Conflict.
//  5. Otherwise INSERT the new reservation and COMMIT.
//
// Any error inside the transaction function causes GORM to rollback
// automatically, releasing the FOR UPDATE lock.
func (r *reservationRepository) CreateWithCapacityCheck(userID uint, zoneID uint, licensePlate string) (*models.Reservation, error) {
	var created models.Reservation

	err := r.db.Transaction(func(tx *gorm.DB) error {
		var z models.ParkingZone
		// 1. ROW-LEVEL LOCKING: lock the parking-zone row for the duration of
		// the transaction. Other concurrent reservation attempts for the same
		// zone will block here until we commit/rollback.
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&z, zoneID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrZoneNotFoundInTx
			}
			return err
		}

		// 2. Count active reservations for this zone (visible inside the tx).
		var activeCount int64
		if err := tx.Model(&models.Reservation{}).
			Where("zone_id = ? AND status = ?", zoneID, "active").
			Count(&activeCount).Error; err != nil {
			return err
		}

		// 3. CAPACITY CHECK. Held spots (entries equal to 1 in spot_holds)
		// are subtracted from capacity alongside real active reservations;
		// they are truly off-limits for booking per the spec.
		//
		// We count the number of entries equal to 1, NOT len(spot_holds),
		// because len(spot_holds) always equals total_capacity and would
		// wrongly reject every reservation.
		//
		// If spot_holds is empty or its length does not match total_capacity
		// (legacy row that has not yet been touched by EnsureSpotHoldsLength),
		// fall back to 0 held spots — i.e. treat the zone as if it had no
		// presentation-only holds. This is the safest assumption in a locked
		// reservation transaction: better to allow a real reservation than to
		// 409 a driver because of a missing bitmap.
		holdCount := 0
		if len(z.SpotHolds) == z.TotalCapacity {
			holdCount = countHeldSpots(z.SpotHolds)
		}

		if int(activeCount)+holdCount >= z.TotalCapacity {
			return ErrZoneFull
		}

		// 4. Create the new reservation record.
		created = models.Reservation{
			UserID:       userID,
			ZoneID:       zoneID,
			LicensePlate: licensePlate,
			Status:       "active",
		}
		if err := tx.Create(&created).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &created, nil
}

// countHeldSpots returns the number of entries equal to 1 in the
// spot_holds bitmap. The previous implementation used len(spot_holds),
// which always equals total_capacity (the array length), so every zone
// was wrongly reported as full the moment spot_holds was populated.
// Held spots are the entries set to 1 by the seeder / rotator; entries
// set to 0 represent still-available spots.
func countHeldSpots(holds []int64) int {
	n := 0
	for _, v := range holds {
		if v == 1 {
			n++
		}
	}
	return n
}

func (r *reservationRepository) FindByID(id uint) (*models.Reservation, error) {
	var reservation models.Reservation
	if err := r.db.Preload("Zone").Preload("User").First(&reservation, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	return &reservation, nil
}

func (r *reservationRepository) ListByUser(userID uint) ([]models.Reservation, error) {
	var reservations []models.Reservation
	if err := r.db.Preload("Zone").
		Where("user_id = ?", userID).
		Order("id DESC").
		Find(&reservations).Error; err != nil {
		return nil, err
	}
	return reservations, nil
}

func (r *reservationRepository) ListAll() ([]models.Reservation, error) {
	var reservations []models.Reservation
	if err := r.db.Preload("Zone").Preload("User").
		Order("id DESC").
		Find(&reservations).Error; err != nil {
		return nil, err
	}
	return reservations, nil
}

func (r *reservationRepository) Update(reservation *models.Reservation) error {
	return r.db.Save(reservation).Error
}

func (r *reservationRepository) Delete(id uint) error {
	return r.db.Delete(&models.Reservation{}, id).Error
}
