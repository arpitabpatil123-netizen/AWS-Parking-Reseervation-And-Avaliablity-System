package database

import (
	"sync"
	"testing"

	"gorm.io/gorm/schema"

	"spotsync-backend/internal/models"
)

func TestDomainModelsHaveValidGormSchemas(t *testing.T) {
	cache := &sync.Map{}
	for _, model := range []interface{}{
		&models.User{},
		&models.ParkingZone{},
		&models.Reservation{},
		&models.Incident{},
		&models.IncidentEvent{},
		&models.Notification{},
	} {
		if _, err := schema.Parse(model, cache, schema.NamingStrategy{}); err != nil {
			t.Errorf("schema parse failed for %T: %v", model, err)
		}
	}
}
