package handler

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"

	"spotsync-backend/internal/dto"
	"spotsync-backend/internal/middleware"
	"spotsync-backend/internal/service"
	"spotsync-backend/pkg/utils"
)

// ReservationHandler exposes HTTP handlers for reservation endpoints.
type ReservationHandler struct {
	reservationService service.ReservationService
}

// NewReservationHandler wires a ReservationHandler bound to the given
// ReservationService.
func NewReservationHandler(reservationService service.ReservationService) *ReservationHandler {
	return &ReservationHandler{reservationService: reservationService}
}

// Create handles POST /api/v1/reservations.
func (h *ReservationHandler) Create(c echo.Context) error {
	userID, ok := middleware.UserIDFromContext(c)
	if !ok {
		return utils.JSONError(c, http.StatusUnauthorized, "Unauthorized", "missing user id")
	}
	var req dto.CreateReservationRequest
	if err := c.Bind(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid request body", err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Validation failed", err.Error())
	}
	reservation, err := h.reservationService.Create(userID, req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrZoneNotFound):
			return utils.JSONError(c, http.StatusNotFound, "Zone not found", err.Error())
		case errors.Is(err, service.ErrZoneFull):
			return utils.JSONError(c, http.StatusConflict, "Zone is full", err.Error())
		default:
			return utils.JSONError(c, http.StatusInternalServerError, "Failed to create reservation", err.Error())
		}
	}
	return utils.JSONSuccess(c, http.StatusCreated, "Reservation created successfully", reservation)
}

// GetByID handles GET /api/v1/reservations/:id.
func (h *ReservationHandler) GetByID(c echo.Context) error {
	userID, ok := middleware.UserIDFromContext(c)
	if !ok {
		return utils.JSONError(c, http.StatusUnauthorized, "Unauthorized", "missing user id")
	}
	isAdmin := middleware.IsAdminFromContext(c)
	id, err := parseID(c)
	if err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid reservation id", err.Error())
	}
	reservation, err := h.reservationService.GetByID(userID, id, isAdmin)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrReservationNotFound):
			return utils.JSONError(c, http.StatusNotFound, "Reservation not found", err.Error())
		case errors.Is(err, service.ErrUnauthorized):
			return utils.JSONError(c, http.StatusForbidden, "Forbidden", err.Error())
		default:
			return utils.JSONError(c, http.StatusInternalServerError, "Failed to fetch reservation", err.Error())
		}
	}
	return utils.JSONSuccess(c, http.StatusOK, "Reservation fetched successfully", reservation)
}

// ListMine handles GET /api/v1/reservations/mine.
func (h *ReservationHandler) ListMine(c echo.Context) error {
	userID, ok := middleware.UserIDFromContext(c)
	if !ok {
		return utils.JSONError(c, http.StatusUnauthorized, "Unauthorized", "missing user id")
	}
	reservations, err := h.reservationService.ListByUser(userID)
	if err != nil {
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to list reservations", err.Error())
	}
	return utils.JSONSuccess(c, http.StatusOK, "Reservations fetched successfully", reservations)
}

// ListAll handles GET /api/v1/reservations (admin only).
func (h *ReservationHandler) ListAll(c echo.Context) error {
	reservations, err := h.reservationService.ListAll()
	if err != nil {
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to list reservations", err.Error())
	}
	return utils.JSONSuccess(c, http.StatusOK, "Reservations fetched successfully", reservations)
}

// UpdateStatus handles PATCH /api/v1/reservations/:id/status.
func (h *ReservationHandler) UpdateStatus(c echo.Context) error {
	userID, ok := middleware.UserIDFromContext(c)
	if !ok {
		return utils.JSONError(c, http.StatusUnauthorized, "Unauthorized", "missing user id")
	}
	isAdmin := middleware.IsAdminFromContext(c)
	id, err := parseID(c)
	if err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid reservation id", err.Error())
	}
	var req dto.UpdateReservationStatusRequest
	if err := c.Bind(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid request body", err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Validation failed", err.Error())
	}
	reservation, err := h.reservationService.UpdateStatus(userID, id, isAdmin, req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrReservationNotFound):
			return utils.JSONError(c, http.StatusNotFound, "Reservation not found", err.Error())
		case errors.Is(err, service.ErrUnauthorized):
			return utils.JSONError(c, http.StatusForbidden, "Forbidden", err.Error())
		case errors.Is(err, service.ErrInvalidStatusChange):
			return utils.JSONError(c, http.StatusConflict, "Invalid status change", err.Error())
		default:
			return utils.JSONError(c, http.StatusInternalServerError, "Failed to update reservation", err.Error())
		}
	}
	return utils.JSONSuccess(c, http.StatusOK, "Reservation updated successfully", reservation)
}

// Delete handles DELETE /api/v1/reservations/:id.
func (h *ReservationHandler) Delete(c echo.Context) error {
	userID, ok := middleware.UserIDFromContext(c)
	if !ok {
		return utils.JSONError(c, http.StatusUnauthorized, "Unauthorized", "missing user id")
	}
	isAdmin := middleware.IsAdminFromContext(c)
	id, err := parseID(c)
	if err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid reservation id", err.Error())
	}
	if err := h.reservationService.Delete(userID, id, isAdmin); err != nil {
		switch {
		case errors.Is(err, service.ErrReservationNotFound):
			return utils.JSONError(c, http.StatusNotFound, "Reservation not found", err.Error())
		case errors.Is(err, service.ErrUnauthorized):
			return utils.JSONError(c, http.StatusForbidden, "Forbidden", err.Error())
		default:
			return utils.JSONError(c, http.StatusInternalServerError, "Failed to delete reservation", err.Error())
		}
	}
	return utils.JSONSuccess(c, http.StatusOK, "Reservation deleted successfully", nil)
}