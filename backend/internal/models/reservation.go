package models

import "time"

// Reservation represents a parking spot reservation by a user.
// Valid Status values are: "active", "completed", "cancelled".
type Reservation struct {
	ID           uint        `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID       uint        `gorm:"not null;index" json:"user_id"`
	User         User        `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user,omitempty"`
	ZoneID       uint        `gorm:"not null;index" json:"zone_id"`
	Zone         ParkingZone `gorm:"foreignKey:ZoneID;constraint:OnDelete:CASCADE" json:"zone,omitempty"`
	LicensePlate string      `gorm:"type:varchar(15);not null" json:"license_plate"`
	Status       string      `gorm:"type:varchar(20);not null;default:'active'" json:"status"`
	CreatedAt    time.Time   `json:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at"`
}
