package seeder

import (
	"fmt"
	"log"

	"gorm.io/gorm"

	"spotsync-backend/internal/models"
)

// SeedIncidentsIfNeeded inserts realistic demo incident closures if the incidents table is empty.
func SeedIncidentsIfNeeded(db *gorm.DB) (int, error) {
	var count int64
	if err := db.Model(&models.Incident{}).Count(&count).Error; err != nil {
		return 0, fmt.Errorf("seeder: failed to count incidents: %w", err)
	}
	if count > 0 {
		return 0, nil
	}

	// Find the admin user to attribute the report to
	var admin models.User
	if err := db.Where("role = ?", "admin").First(&admin).Error; err != nil {
		// If no admin yet, try any user
		if err2 := db.First(&admin).Error; err2 != nil {
			return 0, nil
		}
	}

	// Find demo zones to attach incidents to
	var zones []models.ParkingZone
	if err := db.Order("id ASC").Limit(6).Find(&zones).Error; err != nil || len(zones) < 2 {
		return 0, nil
	}

	// 1. Critical Emergency Closure on Zone 4 (or zone index 3)
	zEmergency := zones[len(zones)-1]
	if len(zones) >= 4 {
		zEmergency = zones[3]
	}

	inc1 := models.Incident{
		ZoneID:      zEmergency.ID,
		Type:        "emergency_closure",
		Description: "High-voltage charging grid maintenance and transformer diagnostics. Zone cordoned off for driver and vehicle safety.",
		Severity:    "critical",
		ReportedBy:  admin.ID,
		Status:      "open",
		ClosesZone:  true,
	}

	if err := db.Create(&inc1).Error; err != nil {
		return 0, err
	}
	// Mark zone as closed
	if err := db.Model(&models.ParkingZone{}).Where("id = ?", zEmergency.ID).Update("emergency_closed", true).Error; err != nil {
		log.Printf("[seeder] Failed to mark zone %d closed: %v", zEmergency.ID, err)
	}

	_ = db.Create(&models.IncidentEvent{
		IncidentID: inc1.ID,
		ActorID:    admin.ID,
		Action:     "reported",
		Details:    inc1.Description,
	})

	// 2. Temporarily Unavailable on Zone 2 (or index 1)
	zTemp := zones[1]
	inc2 := models.Incident{
		ZoneID:      zTemp.ID,
		Type:        "maintenance",
		Description: "Surface repaving, line restriping, and stormwater drainage maintenance underway. Temporary closure in effect.",
		Severity:    "high",
		ReportedBy:  admin.ID,
		Status:      "in_progress",
		ClosesZone:  true,
	}
	if err := db.Create(&inc2).Error; err == nil {
		_ = db.Model(&models.ParkingZone{}).Where("id = ?", zTemp.ID).Update("emergency_closed", true).Error
		_ = db.Create(&models.IncidentEvent{
			IncidentID: inc2.ID,
			ActorID:    admin.ID,
			Action:     "reported",
			Details:    inc2.Description,
		})
	}

	log.Printf("[seeder] Seeded demo emergency incidents for zones #%d and #%d.", zEmergency.ID, zTemp.ID)
	return 2, nil
}

