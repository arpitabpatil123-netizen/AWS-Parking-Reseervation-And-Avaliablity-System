package models

import "time"

// Incident records a staff-reported issue affecting a parking zone.
type Incident struct {
	ID              uint            `gorm:"primaryKey;autoIncrement" json:"id"`
	ZoneID          uint            `gorm:"not null;index" json:"zone_id"`
	Zone            ParkingZone     `gorm:"foreignKey:ZoneID;constraint:OnDelete:RESTRICT" json:"zone,omitempty"`
	Type            string          `gorm:"type:varchar(40);not null;index" json:"type"`
	Description     string          `gorm:"type:text;not null" json:"description"`
	Severity        string          `gorm:"type:varchar(20);not null;index" json:"severity"`
	ReportedBy      uint            `gorm:"not null;index;uniqueIndex:idx_incident_reporter_request,priority:1" json:"reported_by"`
	Reporter        User            `gorm:"foreignKey:ReportedBy;constraint:OnDelete:RESTRICT" json:"reporter,omitempty"`
	Status          string          `gorm:"type:varchar(20);not null;default:'open';index" json:"status"`
	ClosesZone      bool            `gorm:"not null;default:false" json:"closes_zone"`
	ResolutionNotes string          `gorm:"type:text" json:"resolution_notes,omitempty"`
	ResolvedAt      *time.Time      `json:"resolved_at,omitempty"`
	RequestKey      *string         `gorm:"type:varchar(100);uniqueIndex:idx_incident_reporter_request,priority:2" json:"-"`
	History         []IncidentEvent `gorm:"foreignKey:IncidentID" json:"history,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// IncidentEvent is an append-only audit entry for incident changes.
type IncidentEvent struct {
	ID         uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	IncidentID uint      `gorm:"not null;index" json:"incident_id"`
	Incident   Incident  `gorm:"foreignKey:IncidentID;constraint:OnDelete:CASCADE" json:"-"`
	ActorID    uint      `gorm:"not null;index" json:"actor_id"`
	Actor      User      `gorm:"foreignKey:ActorID;constraint:OnDelete:RESTRICT" json:"actor,omitempty"`
	Action     string    `gorm:"type:varchar(40);not null" json:"action"`
	Details    string    `gorm:"type:text" json:"details,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// Notification is a persistent in-app alert for one user.
type Notification struct {
	ID            uint         `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID        uint         `gorm:"not null;uniqueIndex:idx_notification_user_incident_event,priority:1;index" json:"user_id"`
	User          User         `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	IncidentID    uint         `gorm:"not null;uniqueIndex:idx_notification_user_incident_event,priority:2" json:"incident_id"`
	Incident      Incident     `gorm:"foreignKey:IncidentID;constraint:OnDelete:CASCADE" json:"-"`
	ReservationID *uint        `gorm:"index" json:"reservation_id,omitempty"`
	Reservation   *Reservation `gorm:"foreignKey:ReservationID;constraint:OnDelete:SET NULL" json:"-"`
	EventKey      string       `gorm:"type:varchar(30);not null;uniqueIndex:idx_notification_user_incident_event,priority:3" json:"-"`
	Message       string       `gorm:"type:text;not null" json:"message"`
	IsRead        bool         `gorm:"not null;default:false;index" json:"is_read"`
	CreatedAt     time.Time    `json:"created_at"`
}
