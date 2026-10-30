package repository

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"spotsync-backend/internal/dto"
	"spotsync-backend/internal/models"
)

var (
	ErrIncidentNotFound     = errors.New("incident not found")
	ErrNotificationNotFound = errors.New("notification not found")
)

// IncidentRepository stores incident workflows and their notifications.
type IncidentRepository interface {
	Create(reporterID uint, req dto.CreateIncidentRequest) (*models.Incident, error)
	List(status, severity, incidentType string, zoneID uint) ([]models.Incident, error)
	FindByID(id uint) (*models.Incident, error)
	UpdateStatus(actorID, id uint, req dto.UpdateIncidentStatusRequest) (*models.Incident, error)
	ListAffectedReservations(incidentID uint) ([]models.Reservation, error)
	ListNotifications(userID uint) ([]models.Notification, error)
	MarkNotificationRead(userID, id uint) (*models.Notification, error)
}

type incidentRepository struct {
	db *gorm.DB
}

func NewIncidentRepository(db *gorm.DB) IncidentRepository {
	return &incidentRepository{db: db}
}

func (r *incidentRepository) Create(reporterID uint, req dto.CreateIncidentRequest) (*models.Incident, error) {
	closesZone := req.ClosesZone || req.Type == "emergency_closure"
	incident := &models.Incident{}
	var requestKey *string
	if req.IdempotencyKey != "" {
		key := req.IdempotencyKey
		requestKey = &key
	}

	err := r.db.Transaction(func(tx *gorm.DB) error {
		if requestKey != nil {
			var existing models.Incident
			err := tx.Preload("Zone").Preload("Reporter").Preload("History").Preload("History.Actor").
				Where("reported_by = ? AND request_key = ?", reporterID, *requestKey).
				First(&existing).Error
			if err == nil {
				*incident = existing
				return nil
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}

		var zone models.ParkingZone
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&zone, req.ZoneID).Error; err != nil {
			return err
		}

		incident = &models.Incident{
			ZoneID:      zone.ID,
			Type:        req.Type,
			Description: req.Description,
			Severity:    req.Severity,
			ReportedBy:  reporterID,
			Status:      "open",
			ClosesZone:  closesZone,
			RequestKey:  requestKey,
		}
		if err := tx.Create(incident).Error; err != nil {
			return err
		}

		if err := tx.Create(&models.IncidentEvent{
			IncidentID: incident.ID,
			ActorID:    reporterID,
			Action:     "reported",
			Details:    req.Description,
		}).Error; err != nil {
			return err
		}

		if closesZone {
			if err := tx.Model(&zone).Update("emergency_closed", true).Error; err != nil {
				return err
			}
			if err := tx.Create(&models.IncidentEvent{
				IncidentID: incident.ID,
				ActorID:    reporterID,
				Action:     "zone_closed",
				Details:    req.Description,
			}).Error; err != nil {
				return err
			}
		}

		var affected []models.Reservation
		if err := tx.Select("id", "user_id").
			Where("zone_id = ? AND status = ?", zone.ID, "active").
			Find(&affected).Error; err != nil {
			return err
		}
		message := fmt.Sprintf("Parking incident reported for %s. Review your reservation and consider available alternatives.", zone.Name)
		if closesZone {
			message = fmt.Sprintf("Emergency: %s is temporarily closed. Your active reservation may be affected; please review alternatives.", zone.Name)
		}
		for _, reservation := range affected {
			reservationID := reservation.ID
			notification := models.Notification{
				UserID:        reservation.UserID,
				IncidentID:    incident.ID,
				ReservationID: &reservationID,
				EventKey:      "reported",
				Message:       message,
			}
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&notification).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil && requestKey != nil {
		var existing models.Incident
		if lookupErr := r.db.Preload("Zone").Preload("Reporter").Preload("History").Preload("History.Actor").
			Where("reported_by = ? AND request_key = ?", reporterID, *requestKey).
			First(&existing).Error; lookupErr == nil {
			return &existing, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return r.loadIncident(incident.ID)
}

func (r *incidentRepository) List(status, severity, incidentType string, zoneID uint) ([]models.Incident, error) {
	query := r.db.Model(&models.Incident{}).
		Preload("Zone").Preload("Reporter").Preload("History").Preload("History.Actor")
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if severity != "" {
		query = query.Where("severity = ?", severity)
	}
	if incidentType != "" {
		query = query.Where("type = ?", incidentType)
	}
	if zoneID > 0 {
		query = query.Where("zone_id = ?", zoneID)
	}
	var incidents []models.Incident
	err := query.Order("created_at DESC").Find(&incidents).Error
	return incidents, err
}

func (r *incidentRepository) FindByID(id uint) (*models.Incident, error) {
	return r.loadIncident(id)
}

func (r *incidentRepository) loadIncident(id uint) (*models.Incident, error) {
	var incident models.Incident
	if err := r.db.Preload("Zone").Preload("Reporter").
		Preload("History").Preload("History.Actor").
		First(&incident, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrIncidentNotFound
		}
		return nil, err
	}
	return &incident, nil
}

func (r *incidentRepository) UpdateStatus(actorID, id uint, req dto.UpdateIncidentStatusRequest) (*models.Incident, error) {
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var incident models.Incident
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&incident, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrIncidentNotFound
			}
			return err
		}

		var zone models.ParkingZone
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&zone, incident.ZoneID).Error; err != nil {
			return err
		}

		oldStatus := incident.Status
		if oldStatus == req.Status && incident.ResolutionNotes == req.ResolutionNotes {
			return nil
		}
		now := time.Now()
		updates := map[string]interface{}{
			"status":           req.Status,
			"resolution_notes": req.ResolutionNotes,
		}
		if req.Status == "resolved" {
			updates["resolved_at"] = now
		} else {
			updates["resolved_at"] = nil
		}
		if err := tx.Model(&incident).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.Create(&models.IncidentEvent{
			IncidentID: incident.ID,
			ActorID:    actorID,
			Action:     "status_changed",
			Details:    fmt.Sprintf("%s -> %s. %s", oldStatus, req.Status, req.ResolutionNotes),
		}).Error; err != nil {
			return err
		}

		if incident.ClosesZone {
			active := req.Status == "open" || req.Status == "in_progress"
			if active {
				if err := tx.Model(&zone).Update("emergency_closed", true).Error; err != nil {
					return err
				}
				if oldStatus == "resolved" || oldStatus == "cancelled" {
					if err := tx.Create(&models.IncidentEvent{
						IncidentID: incident.ID,
						ActorID:    actorID,
						Action:     "zone_reclosed",
						Details:    "Zone closure reactivated",
					}).Error; err != nil {
						return err
					}
					return r.notifyIncidentRecipients(tx, incident.ID, "reclosed",
						fmt.Sprintf("Emergency closure is active again for %s. Please review your parking plans.", zone.Name))
				}
				return nil
			}

			var otherClosures int64
			if err := tx.Model(&models.Incident{}).
				Where("zone_id = ? AND id <> ? AND closes_zone = ? AND status IN ?", incident.ZoneID, incident.ID, true, []string{"open", "in_progress"}).
				Count(&otherClosures).Error; err != nil {
				return err
			}
			if otherClosures == 0 {
				if zone.EmergencyClosed {
					if err := tx.Model(&zone).Update("emergency_closed", false).Error; err != nil {
						return err
					}
					if err := tx.Create(&models.IncidentEvent{
						IncidentID: incident.ID,
						ActorID:    actorID,
						Action:     "zone_reopened",
						Details:    "No active zone closures remain",
					}).Error; err != nil {
						return err
					}
					return r.notifyZoneReopened(tx, incident.ZoneID, zone.Name)
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.loadIncident(id)
}

func (r *incidentRepository) notifyIncidentRecipients(tx *gorm.DB, incidentID uint, eventKey, message string) error {
	var incident models.Incident
	if err := tx.Select("id", "zone_id").First(&incident, incidentID).Error; err != nil {
		return err
	}
	var recipients []models.Reservation
	if err := tx.Select("id", "user_id").
		Where("zone_id = ? AND status = ?", incident.ZoneID, "active").
		Find(&recipients).Error; err != nil {
		return err
	}
	for _, recipient := range recipients {
		reservationID := recipient.ID
		notification := models.Notification{
			UserID:        recipient.UserID,
			IncidentID:    incidentID,
			ReservationID: &reservationID,
			EventKey:      eventKey,
			Message:       message,
		}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&notification).Error; err != nil {
			return err
		}
	}
	return nil
}

func (r *incidentRepository) notifyZoneReopened(tx *gorm.DB, zoneID uint, zoneName string) error {
	var recipients []models.Notification
	if err := tx.Model(&models.Notification{}).
		Select("notifications.user_id, notifications.incident_id, notifications.reservation_id").
		Joins("JOIN incidents ON incidents.id = notifications.incident_id").
		Where("incidents.zone_id = ? AND incidents.closes_zone = ? AND notifications.event_key = ?", zoneID, true, "reported").
		Find(&recipients).Error; err != nil {
		return err
	}
	for _, recipient := range recipients {
		notification := models.Notification{
			UserID:        recipient.UserID,
			IncidentID:    recipient.IncidentID,
			ReservationID: recipient.ReservationID,
			EventKey:      "reopened",
			Message:       fmt.Sprintf("%s has reopened. You can check current availability and alternatives.", zoneName),
		}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&notification).Error; err != nil {
			return err
		}
	}
	return nil
}

func (r *incidentRepository) ListAffectedReservations(incidentID uint) ([]models.Reservation, error) {
	var incident models.Incident
	if err := r.db.Select("id", "zone_id").First(&incident, incidentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrIncidentNotFound
		}
		return nil, err
	}
	var reservations []models.Reservation
	err := r.db.Preload("User").Preload("Zone").
		Where("zone_id = ? AND status = ?", incident.ZoneID, "active").
		Order("id DESC").Find(&reservations).Error
	return reservations, err
}

func (r *incidentRepository) ListNotifications(userID uint) ([]models.Notification, error) {
	var notifications []models.Notification
	err := r.db.Where("user_id = ?", userID).Order("created_at DESC").Find(&notifications).Error
	return notifications, err
}

func (r *incidentRepository) MarkNotificationRead(userID, id uint) (*models.Notification, error) {
	var notification models.Notification
	result := r.db.Model(&notification).
		Where("id = ? AND user_id = ?", id, userID).
		Update("is_read", true)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, ErrNotificationNotFound
	}
	if err := r.db.Where("id = ? AND user_id = ?", id, userID).First(&notification).Error; err != nil {
		return nil, err
	}
	return &notification, nil
}
