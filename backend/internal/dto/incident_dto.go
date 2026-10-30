package dto

// CreateIncidentRequest is the payload for POST /api/v1/incidents.
// Reporter identity is taken from the authenticated request, never this body.
type CreateIncidentRequest struct {
	ZoneID         uint   `json:"zone_id" validate:"required,gt=0"`
	Type           string `json:"type" validate:"required,oneof=emergency_closure blocked_space vehicle_obstruction maintenance safety other"`
	Description    string `json:"description" validate:"required,min=5,max=2000"`
	Severity       string `json:"severity" validate:"required,oneof=low medium high critical"`
	ClosesZone     bool   `json:"closes_zone"`
	IdempotencyKey string `json:"idempotency_key" validate:"required,min=1,max=100"`
}

// UpdateIncidentStatusRequest updates the workflow state and resolution notes.
type UpdateIncidentStatusRequest struct {
	Status          string `json:"status" validate:"required,oneof=open in_progress resolved cancelled"`
	ResolutionNotes string `json:"resolution_notes" validate:"omitempty,max=5000"`
}
