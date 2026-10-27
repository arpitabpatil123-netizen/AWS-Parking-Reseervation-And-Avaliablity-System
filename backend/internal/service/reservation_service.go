package service

import (
	"errors"

	"gorm.io/gorm"

	"spotsync-backend/internal/dto"
	"spotsync-backend/internal/models"
	"spotsync-backend/internal/repository"
)

// Sentinel errors returned by ReservationService. The handler layer maps
// these to HTTP status codes.
//
// Note: ErrZoneNotFound is defined in zone_service.go (same package) and is
// re-used here to keep the package-level error vocabulary consistent.
var (
	ErrReservationNotFound = errors.New("reservation not found")
	ErrZoneFull            = errors.New("zone has reached full capacity")
	ErrUnauthorized        = errors.New("not authorized to perform this action")
	ErrInvalidStatusChange = errors.New("invalid status transition")
)

// ReservationService defines the business-logic contract for reservations.
type ReservationService interface {
	Create(userID uint, req dto.CreateReservationRequest) (*models.Reservation, error)
	GetByID(userID uint, id uint, isAdmin bool) (*models.Reservation, error)
	ListByUser(userID uint) ([]models.Reservation, error)
	ListAll() ([]models.Reservation, error)
	UpdateStatus(userID uint, id uint, isAdmin bool, req dto.UpdateReservationStatusRequest) (*models.Reservation, error)
	Delete(userID uint, id uint, isAdmin bool) error
}

type reservationService struct {
	reservationRepo repository.ReservationRepository
}

// NewReservationService wires a ReservationService backed by the given
// repository. The capacity check + insert happens atomically inside the
// repository's CreateWithCapacityCheck (SELECT ... FOR UPDATE).
func NewReservationService(reservationRepo repository.ReservationRepository) ReservationService {
	return &reservationService{
		reservationRepo: reservationRepo,
	}
}

// Create reserves a parking spot for the authenticated user.
//
// The capacity check is performed inside the repository inside a single
// transaction that holds a row-level FOR UPDATE lock on the parking zone
// row. This guarantees that under concurrent reservation attempts for the
// same zone we never exceed total_capacity (i.e. no "21st reservation"
// race condition on an EV spot with capacity 20).
func (s *reservationService) Create(userID uint, req dto.CreateReservationRequest) (*models.Reservation, error) {
	reservation, err := s.reservationRepo.CreateWithCapacityCheck(userID, req.ZoneID, req.LicensePlate)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrZoneNotFoundInTx):
			return nil, ErrZoneNotFound
		case errors.Is(err, repository.ErrZoneFull):
			return nil, ErrZoneFull
		default:
			return nil, err
		}
	}
	return reservation, nil
}

func (s *reservationService) GetByID(userID uint, id uint, isAdmin bool) (*models.Reservation, error) {
	reservation, err := s.reservationRepo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrReservationNotFound
		}
		return nil, err
	}
	if !isAdmin && reservation.UserID != userID {
		return nil, ErrUnauthorized
	}
	return reservation, nil
}

func (s *reservationService) ListByUser(userID uint) ([]models.Reservation, error) {
	return s.reservationRepo.ListByUser(userID)
}

func (s *reservationService) ListAll() ([]models.Reservation, error) {
	return s.reservationRepo.ListAll()
}

func (s *reservationService) UpdateStatus(userID uint, id uint, isAdmin bool, req dto.UpdateReservationStatusRequest) (*models.Reservation, error) {
	reservation, err := s.reservationRepo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrReservationNotFound
		}
		return nil, err
	}
	if !isAdmin && reservation.UserID != userID {
		return nil, ErrUnauthorized
	}
	// Only allow transitioning from "active" to a terminal state.
	if reservation.Status != "active" {
		return nil, ErrInvalidStatusChange
	}
	reservation.Status = req.Status
	if err := s.reservationRepo.Update(reservation); err != nil {
		return nil, err
	}
	return reservation, nil
}

func (s *reservationService) Delete(userID uint, id uint, isAdmin bool) error {
	reservation, err := s.reservationRepo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrReservationNotFound
		}
		return err
	}
	if !isAdmin && reservation.UserID != userID {
		return ErrUnauthorized
	}
	return s.reservationRepo.Delete(id)
}
