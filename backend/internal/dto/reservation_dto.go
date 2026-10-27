package dto

// CreateReservationRequest is the payload for POST /api/v1/reservations.
type CreateReservationRequest struct {
	ZoneID       uint   `json:"zone_id" validate:"required,gt=0"`
	LicensePlate string `json:"license_plate" validate:"required,min=2,max=15"`
}

// UpdateReservationStatusRequest is the payload for PATCH /api/v1/reservations/:id/status.
type UpdateReservationStatusRequest struct {
	Status string `json:"status" validate:"required,oneof=active completed cancelled"`
}