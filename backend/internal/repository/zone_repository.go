package repository

import (
	"errors"
	"strings"
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
	// Update only admin-editable catalog fields. Saving the full model could
	// overwrite an emergency closure or rotator update loaded from a stale row.
	return r.db.Model(&models.ParkingZone{}).
		Where("id = ?", zone.ID).
		Updates(map[string]interface{}{
			"name":           zone.Name,
			"type":           zone.Type,
			"total_capacity": zone.TotalCapacity,
			"price_per_hour": zone.PricePerHour,
		}).Error
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

// DeriveLocation extracts or generates a clean location from a zone name.
func DeriveLocation(name string) string {
	switch name {
	case "Kempegowda Airport T1 EV Charging Hub", "Kempegowda Airport T1 General Parking", "Kempegowda Airport T1 Covered Deck":
		return "Kempegowda Airport Terminal 1, Devanahalli"
	case "Kempegowda Airport T2 EV Bay", "Kempegowda Airport T2 Open Parking":
		return "Kempegowda Airport Terminal 2, Devanahalli"
	case "Orion Mall Rajajinagar EV Charging", "Orion Mall Rajajinagar General Parking", "Orion Mall Rajajinagar Underground P-1":
		return "Orion Mall, Rajajinagar"
	case "BIEC Tumakuru Road EV Stalls", "BIEC Tumakuru Road Covered Parking":
		return "BIEC, Tumakuru Road"
	case "Chinnaswamy Stadium EV Parking", "Chinnaswamy Stadium North Covered Parking":
		return "Chinnaswamy Stadium, MG Road"
	case "Manyata Tech Park Nagawara EV Plaza":
		return "Manyata Tech Park, Nagawara"
	case "Bellandur EV Charge Point":
		return "Outer Ring Road, Bellandur"
	case "Vidhana Soudha EV Priority Parking":
		return "Ambedkar Veedhi, Central Bengaluru"
	case "Manipal Hospital Old Airport Road EV Bay", "Manipal Hospital Old Airport Road Covered Garage":
		return "Old Airport Road, Kodihalli"
	case "IISc Bengaluru EV Fast Charge":
		return "CV Raman Road, Mathikere"
	case "NICE Road Electronic City EV Station":
		return "NICE Road, Electronic City Phase 1"
	case "UB City CBD EV Charging", "UB City Covered Garage":
		return "UB City, Vittal Mallya Road"
	case "Kanteerava Stadium EV Lot":
		return "Kasturba Road, Sampangi Rama Nagar"
	case "Phoenix Marketcity Mahadevapura EV Corner", "Phoenix Marketcity Mahadevapura Underground P-2":
		return "Phoenix Marketcity, Mahadevapura"
	case "Forum South Bengaluru EV Charging":
		return "Forum South Mall, Kanakapura Road"
	case "MG Road Street Parking", "MG Road Metro Multi-Level Parking":
		return "MG Road Boulevard"
	case "KR Market Parking Lot":
		return "KR Market, Kalasipalya"
	case "KSR Bengaluru City Station North Lot":
		return "KSR Railway Station, Majestic"
	case "Majestic Bus Stand Long Stay Parking":
		return "Kempegowda Bus Station, Majestic"
	case "Bengaluru Palace Grounds Event Parking":
		return "Palace Grounds, Jayamahal"
	case "Sankey Tank Open Lot":
		return "Sankey Tank, Sadashivanagar"
	case "Jayanagar 4th Block Community Parking":
		return "4th Block, Jayanagar"
	case "Brigade Road Parking", "Brigade Road Covered Garage":
		return "Brigade Road Commercial Hub"
	case "Cubbon Park Parking":
		return "Cubbon Park, Kasturba Road"
	case "Koramangala 5th Block Parking":
		return "5th Block, Koramangala"
	case "Yelahanka Town Parking":
		return "Yelahanka Old Town"
	case "Peenya Industrial Area Parking":
		return "Peenya Industrial Area Phase 1"
	case "Mysuru Palace Covered Parking":
		return "Mysuru Palace, Varaha Gate"
	}

	clean := name
	suffixes := []string{
		" EV Charging Hub", " EV Charging", " EV Stalls", " EV Bay", " EV Parking", " EV Plaza",
		" EV Charge Point", " EV Priority Parking", " EV Fast Charge", " EV Station", " EV Lot",
		" EV Corner", " General Parking", " Open Parking", " Street Parking", " Parking Lot",
		" North Lot", " Long Stay Parking", " Event Parking", " Open Lot", " Community Parking",
		" Parking", " Covered Garage", " Multi-Level Parking", " Underground P-1", " Underground P-2",
		" Covered Deck", " Covered Parking",
	}
	for _, suffix := range suffixes {
		if strings.HasSuffix(clean, suffix) {
			clean = strings.TrimSuffix(clean, suffix)
			break
		}
	}
	if clean != "" {
		return clean + ", Bengaluru"
	}
	return "Bengaluru, Karnataka"
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
		ID                   uint          `gorm:"column:id"`
		Name                 string        `gorm:"column:name"`
		Type                 string        `gorm:"column:type"`
		TotalCapacity        int           `gorm:"column:total_capacity"`
		AvailableSpots       int           `gorm:"column:available_spots"`
		EmergencyClosed      bool          `gorm:"column:emergency_closed"`
		ClosureReason        string        `gorm:"column:emergency_closure_reason"`
		LatestIncidentStatus string        `gorm:"column:latest_incident_status"`
		LatestIncidentType   string        `gorm:"column:latest_incident_type"`
		PricePerHour         float64       `gorm:"column:price_per_hour"`
		SpotHolds            pq.Int64Array `gorm:"column:spot_holds;type:integer[]"`
		CreatedAt            string        `gorm:"column:created_at"`
		UpdatedAt            string        `gorm:"column:updated_at"`
	}

	var rows []row
	err := r.db.
		Table("parking_zones pz").
		Select(`pz.id, pz.name, pz.type, pz.total_capacity, pz.emergency_closed,
		        CASE WHEN pz.emergency_closed THEN 0 ELSE GREATEST(0, pz.total_capacity
		            - (SELECT COUNT(*) FROM reservations r
		                WHERE r.zone_id = pz.id AND r.status = 'active')
		        ) END AS available_spots,
		        (SELECT i.description FROM incidents i
		            WHERE i.zone_id = pz.id AND i.closes_zone = true
		              AND i.status IN ('open', 'in_progress')
		            ORDER BY i.created_at DESC LIMIT 1) AS emergency_closure_reason,
		        (SELECT i.status FROM incidents i
		            WHERE i.zone_id = pz.id
		            ORDER BY i.created_at DESC LIMIT 1) AS latest_incident_status,
		        (SELECT i.type FROM incidents i
		            WHERE i.zone_id = pz.id
		            ORDER BY i.created_at DESC LIMIT 1) AS latest_incident_type,
		        pz.price_per_hour, pz.spot_holds,
		        pz.created_at, pz.updated_at`).
		Order("pz.id ASC").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	out := make([]dto.ZoneResponse, 0, len(rows))
	for _, r := range rows {
		emergencyStatus := ""
		affectedSpots := 0
		closureReason := r.ClosureReason

		if r.EmergencyClosed {
			affectedSpots = r.TotalCapacity
			switch r.LatestIncidentType {
			case "emergency_closure":
				emergencyStatus = "Emergency Active"
			case "blocked_space":
				emergencyStatus = "Blocked"
			case "maintenance":
				emergencyStatus = "Temporarily Unavailable"
			default:
				if r.LatestIncidentStatus == "in_progress" {
					emergencyStatus = "Temporarily Unavailable"
				} else {
					emergencyStatus = "Emergency Active"
				}
			}
			if closureReason == "" {
				closureReason = "Temporary safety and maintenance closure."
			}
		} else if r.LatestIncidentStatus == "resolved" {
			emergencyStatus = "Restored"
		}

		spotHolds := make([]int64, r.TotalCapacity)
		occupied := r.TotalCapacity - r.AvailableSpots
		if !r.EmergencyClosed {
			for i := 0; i < occupied && i < r.TotalCapacity; i++ {
				spotHolds[i] = 1
			}
		}

		z := dto.ZoneResponse{
			ID:              r.ID,
			Name:            r.Name,
			Location:        DeriveLocation(r.Name),
			Type:            r.Type,
			TotalCapacity:   r.TotalCapacity,
			AvailableSpots:  r.AvailableSpots,
			EmergencyClosed: r.EmergencyClosed,
			EmergencyStatus: emergencyStatus,
			ClosureReason:   closureReason,
			AffectedSpots:   affectedSpots,
			PricePerHour:    r.PricePerHour,
			SpotHolds:       spotHolds,
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
		ID                   uint          `gorm:"column:id"`
		Name                 string        `gorm:"column:name"`
		Type                 string        `gorm:"column:type"`
		TotalCapacity        int           `gorm:"column:total_capacity"`
		AvailableSpots       int           `gorm:"column:available_spots"`
		EmergencyClosed      bool          `gorm:"column:emergency_closed"`
		ClosureReason        string        `gorm:"column:emergency_closure_reason"`
		LatestIncidentStatus string        `gorm:"column:latest_incident_status"`
		LatestIncidentType   string        `gorm:"column:latest_incident_type"`
		PricePerHour         float64       `gorm:"column:price_per_hour"`
		SpotHolds            pq.Int64Array `gorm:"column:spot_holds;type:integer[]"`
		CreatedAt            string        `gorm:"column:created_at"`
		UpdatedAt            string        `gorm:"column:updated_at"`
	}

	var r0 row
	err := r.db.
		Table("parking_zones pz").
		Select(`pz.id, pz.name, pz.type, pz.total_capacity, pz.emergency_closed,
		        CASE WHEN pz.emergency_closed THEN 0 ELSE GREATEST(0, pz.total_capacity
		            - (SELECT COUNT(*) FROM reservations r
		                WHERE r.zone_id = pz.id AND r.status = 'active')
		        ) END AS available_spots,
		        (SELECT i.description FROM incidents i
		            WHERE i.zone_id = pz.id AND i.closes_zone = true
		              AND i.status IN ('open', 'in_progress')
		            ORDER BY i.created_at DESC LIMIT 1) AS emergency_closure_reason,
		        (SELECT i.status FROM incidents i
		            WHERE i.zone_id = pz.id
		            ORDER BY i.created_at DESC LIMIT 1) AS latest_incident_status,
		        (SELECT i.type FROM incidents i
		            WHERE i.zone_id = pz.id
		            ORDER BY i.created_at DESC LIMIT 1) AS latest_incident_type,
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

	emergencyStatus := ""
	affectedSpots := 0
	closureReason := r0.ClosureReason

	if r0.EmergencyClosed {
		affectedSpots = r0.TotalCapacity
		switch r0.LatestIncidentType {
		case "emergency_closure":
			emergencyStatus = "Emergency Active"
		case "blocked_space":
			emergencyStatus = "Blocked"
		case "maintenance":
			emergencyStatus = "Temporarily Unavailable"
		default:
			if r0.LatestIncidentStatus == "in_progress" {
				emergencyStatus = "Temporarily Unavailable"
			} else {
				emergencyStatus = "Emergency Active"
			}
		}
		if closureReason == "" {
			closureReason = "Temporary safety and maintenance closure."
		}
	} else if r0.LatestIncidentStatus == "resolved" {
		emergencyStatus = "Restored"
	}

	spotHolds := make([]int64, r0.TotalCapacity)
	occupied := r0.TotalCapacity - r0.AvailableSpots
	if !r0.EmergencyClosed {
		for i := 0; i < occupied && i < r0.TotalCapacity; i++ {
			spotHolds[i] = 1
		}
	}

	z := &dto.ZoneResponse{
		ID:              r0.ID,
		Name:            r0.Name,
		Location:        DeriveLocation(r0.Name),
		Type:            r0.Type,
		TotalCapacity:   r0.TotalCapacity,
		AvailableSpots:  r0.AvailableSpots,
		EmergencyClosed: r0.EmergencyClosed,
		EmergencyStatus: emergencyStatus,
		ClosureReason:   closureReason,
		AffectedSpots:   affectedSpots,
		PricePerHour:    r0.PricePerHour,
		SpotHolds:       spotHolds,
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
