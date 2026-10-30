package handler

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"spotsync-backend/internal/dto"
	"spotsync-backend/internal/middleware"
	"spotsync-backend/internal/service"
	"spotsync-backend/pkg/utils"
)

type IncidentHandler struct {
	service service.IncidentService
}

func NewIncidentHandler(incidentService service.IncidentService) *IncidentHandler {
	return &IncidentHandler{service: incidentService}
}

func (h *IncidentHandler) Create(c echo.Context) error {
	reporterID, ok := middleware.UserIDFromContext(c)
	if !ok {
		return utils.JSONError(c, http.StatusUnauthorized, "Unauthorized", "missing user id")
	}
	var req dto.CreateIncidentRequest
	if err := c.Bind(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid request body", "request body is invalid")
	}
	if key := c.Request().Header.Get("Idempotency-Key"); key != "" {
		req.IdempotencyKey = key
	}
	if err := c.Validate(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Validation failed", err.Error())
	}
	incident, err := h.service.Create(reporterID, req)
	if errors.Is(err, service.ErrZoneNotFound) {
		return utils.JSONError(c, http.StatusNotFound, "Zone not found", "the requested parking zone does not exist")
	}
	if err != nil {
		log.Printf("[incident_handler] create incident failed: %v", err)
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to create incident", "the incident could not be saved")
	}
	return utils.JSONSuccess(c, http.StatusCreated, "Incident reported successfully", incident)
}

func (h *IncidentHandler) List(c echo.Context) error {
	status := c.QueryParam("status")
	severity := c.QueryParam("severity")
	incidentType := c.QueryParam("type")
	if !oneOfOrEmpty(status, "open", "in_progress", "resolved", "cancelled") ||
		!oneOfOrEmpty(severity, "low", "medium", "high", "critical") ||
		!oneOfOrEmpty(incidentType, "emergency_closure", "blocked_space", "vehicle_obstruction", "maintenance", "safety", "other") {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid filter", "one or more incident filters are invalid")
	}
	var zoneID uint64
	if raw := c.QueryParam("zone_id"); raw != "" {
		parsed, err := strconv.ParseUint(raw, 10, 64)
		if err != nil || parsed == 0 {
			return utils.JSONError(c, http.StatusBadRequest, "Invalid zone id", "zone_id must be a positive integer")
		}
		zoneID = parsed
	}
	incidents, err := h.service.List(status, severity, incidentType, uint(zoneID))
	if err != nil {
		log.Printf("[incident_handler] list incidents failed: %v", err)
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to list incidents", "incidents could not be loaded")
	}
	return utils.JSONSuccess(c, http.StatusOK, "Incidents fetched successfully", incidents)
}

func (h *IncidentHandler) GetByID(c echo.Context) error {
	id, err := parseID(c)
	if err != nil || id == 0 {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid incident id", "incident id must be a positive integer")
	}
	incident, err := h.service.GetByID(id)
	if errors.Is(err, service.ErrIncidentNotFound) {
		return utils.JSONError(c, http.StatusNotFound, "Incident not found", "the requested incident does not exist")
	}
	if err != nil {
		log.Printf("[incident_handler] get incident failed: %v", err)
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to fetch incident", "incident details could not be loaded")
	}
	return utils.JSONSuccess(c, http.StatusOK, "Incident fetched successfully", incident)
}

func (h *IncidentHandler) UpdateStatus(c echo.Context) error {
	actorID, ok := middleware.UserIDFromContext(c)
	if !ok {
		return utils.JSONError(c, http.StatusUnauthorized, "Unauthorized", "missing user id")
	}
	id, err := parseID(c)
	if err != nil || id == 0 {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid incident id", "incident id must be a positive integer")
	}
	var req dto.UpdateIncidentStatusRequest
	if err := c.Bind(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid request body", "request body is invalid")
	}
	if err := c.Validate(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Validation failed", err.Error())
	}
	incident, err := h.service.UpdateStatus(actorID, id, req)
	if errors.Is(err, service.ErrIncidentNotFound) {
		return utils.JSONError(c, http.StatusNotFound, "Incident not found", "the requested incident does not exist")
	}
	if err != nil {
		log.Printf("[incident_handler] update incident failed: %v", err)
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to update incident", "the incident could not be updated")
	}
	return utils.JSONSuccess(c, http.StatusOK, "Incident updated successfully", incident)
}

func (h *IncidentHandler) AffectedReservations(c echo.Context) error {
	id, err := parseID(c)
	if err != nil || id == 0 {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid incident id", "incident id must be a positive integer")
	}
	reservations, err := h.service.ListAffectedReservations(id)
	if errors.Is(err, service.ErrIncidentNotFound) {
		return utils.JSONError(c, http.StatusNotFound, "Incident not found", "the requested incident does not exist")
	}
	if err != nil {
		log.Printf("[incident_handler] affected reservations lookup failed: %v", err)
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to load affected reservations", "affected reservations could not be loaded")
	}
	return utils.JSONSuccess(c, http.StatusOK, "Affected reservations fetched successfully", reservations)
}

func (h *IncidentHandler) ListNotifications(c echo.Context) error {
	userID, ok := middleware.UserIDFromContext(c)
	if !ok {
		return utils.JSONError(c, http.StatusUnauthorized, "Unauthorized", "missing user id")
	}
	notifications, err := h.service.ListNotifications(userID)
	if err != nil {
		log.Printf("[incident_handler] notifications lookup failed: %v", err)
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to load notifications", "notifications could not be loaded")
	}
	return utils.JSONSuccess(c, http.StatusOK, "Notifications fetched successfully", notifications)
}

func (h *IncidentHandler) MarkNotificationRead(c echo.Context) error {
	userID, ok := middleware.UserIDFromContext(c)
	if !ok {
		return utils.JSONError(c, http.StatusUnauthorized, "Unauthorized", "missing user id")
	}
	id, err := parseID(c)
	if err != nil || id == 0 {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid notification id", "notification id must be a positive integer")
	}
	notification, err := h.service.MarkNotificationRead(userID, id)
	if errors.Is(err, service.ErrNotificationNotFound) {
		return utils.JSONError(c, http.StatusNotFound, "Notification not found", "the notification does not exist")
	}
	if err != nil {
		log.Printf("[incident_handler] mark notification read failed: %v", err)
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to update notification", "the notification could not be updated")
	}
	return utils.JSONSuccess(c, http.StatusOK, "Notification marked as read", notification)
}

func oneOfOrEmpty(value string, allowed ...string) bool {
	if value == "" {
		return true
	}
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}
