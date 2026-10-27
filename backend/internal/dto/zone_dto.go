package dto

import "time"

// CreateZoneRequest is the payload for POST /api/v1/zones.
type CreateZoneRequest struct {
	Name          string `json:"name" validate:"required,min=2,max=100"`
	Type          string `json:"type" validate:"required,oneof=general ev_charging covered"`
	TotalCapacity int    `json:"total_capacity" validate:"required,gt=0"`
	// PricePerHour is expressed in Indian rupees (INR).
	PricePerHour float64 `json:"price_per_hour" validate:"required,gt=0"`
}

// ZoneResponse is the public-facing representation of a ParkingZone, including
// the dynamically computed AvailableSpots value.
type ZoneResponse struct {
	ID             uint   `json:"id"`
	Name           string `json:"name"`
	Type           string `json:"type"`
	TotalCapacity  int    `json:"total_capacity"`
	AvailableSpots int    `json:"available_spots"`
	// PricePerHour is expressed in Indian rupees (INR).
	PricePerHour float64 `json:"price_per_hour"`
	// SpotHolds is a per-spot bitmap of length TotalCapacity. Element i
	// is 1 when spot #i+1 is held (presentation-only) and 0 when it is
	// available. Reserved for clients that want to render a per-spot
	// grid; safe to ignore when the UI only needs AvailableSpots.
	SpotHolds []int64   `json:"spot_holds"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

// UpdateZoneRequest allows partial updates to a zone. All fields are optional;
// only provided fields are applied.
type UpdateZoneRequest struct {
	Name          string  `json:"name" validate:"omitempty,min=2,max=100"`
	Type          string  `json:"type" validate:"omitempty,oneof=general ev_charging covered"`
	TotalCapacity int     `json:"total_capacity" validate:"omitempty,gt=0"`
	PricePerHour  float64 `json:"price_per_hour" validate:"omitempty,gt=0"`
}
