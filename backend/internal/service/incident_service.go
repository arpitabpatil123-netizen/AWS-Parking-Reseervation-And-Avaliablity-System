package service

import (
	"errors"

	"gorm.io/gorm"

	"spotsync-backend/internal/dto"
	"spotsync-backend/internal/models"
	"spotsync-backend/internal/repository"
)

var (
	ErrIncidentNotFound     = errors.New("incident not found")
	ErrNotificationNotFound = errors.New("notification not found")
)

// IncidentService defines incident and in-app notification operations.
type IncidentService interface {
	Create(reporterID uint, req dto.CreateIncidentRequest) (*models.Incident, error)
	List(status, severity, incidentType string, zoneID uint) ([]models.Incident, error)
	GetByID(id uint) (*models.Incident, error)
	UpdateStatus(actorID, id uint, req dto.UpdateIncidentStatusRequest) (*models.Incident, error)
	ListAffectedReservations(incidentID uint) ([]models.Reservation, error)
	ListNotifications(userID uint) ([]models.Notification, error)
	MarkNotificationRead(userID, id uint) (*models.Notification, error)
}

type incidentService struct {
	repo repository.IncidentRepository
}

func NewIncidentService(repo repository.IncidentRepository) IncidentService {
	return &incidentService{repo: repo}
}

func (s *incidentService) Create(reporterID uint, req dto.CreateIncidentRequest) (*models.Incident, error) {
	incident, err := s.repo.Create(reporterID, req)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrZoneNotFound
	}
	return incident, err
}

func (s *incidentService) List(status, severity, incidentType string, zoneID uint) ([]models.Incident, error) {
	return s.repo.List(status, severity, incidentType, zoneID)
}

func (s *incidentService) GetByID(id uint) (*models.Incident, error) {
	incident, err := s.repo.FindByID(id)
	if errors.Is(err, repository.ErrIncidentNotFound) {
		return nil, ErrIncidentNotFound
	}
	return incident, err
}

func (s *incidentService) UpdateStatus(actorID, id uint, req dto.UpdateIncidentStatusRequest) (*models.Incident, error) {
	incident, err := s.repo.UpdateStatus(actorID, id, req)
	if errors.Is(err, repository.ErrIncidentNotFound) {
		return nil, ErrIncidentNotFound
	}
	return incident, err
}

func (s *incidentService) ListAffectedReservations(incidentID uint) ([]models.Reservation, error) {
	reservations, err := s.repo.ListAffectedReservations(incidentID)
	if errors.Is(err, repository.ErrIncidentNotFound) {
		return nil, ErrIncidentNotFound
	}
	return reservations, err
}

func (s *incidentService) ListNotifications(userID uint) ([]models.Notification, error) {
	return s.repo.ListNotifications(userID)
}

func (s *incidentService) MarkNotificationRead(userID, id uint) (*models.Notification, error) {
	notification, err := s.repo.MarkNotificationRead(userID, id)
	if errors.Is(err, repository.ErrNotificationNotFound) {
		return nil, ErrNotificationNotFound
	}
	return notification, err
}
