package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"spotsync-backend/internal/dto"
	"spotsync-backend/internal/service"
	"spotsync-backend/pkg/utils"
)

// ZoneHandler exposes HTTP handlers for parking zone endpoints.
type ZoneHandler struct {
	zoneService service.ZoneService
}

// NewZoneHandler wires a ZoneHandler bound to the given ZoneService.
func NewZoneHandler(zoneService service.ZoneService) *ZoneHandler {
	return &ZoneHandler{zoneService: zoneService}
}

// Create handles POST /api/v1/zones.
func (h *ZoneHandler) Create(c echo.Context) error {
	var req dto.CreateZoneRequest
	if err := c.Bind(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid request body", err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Validation failed", err.Error())
	}
	zone, err := h.zoneService.Create(req)
	if err != nil {
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to create zone", err.Error())
	}
	return utils.JSONSuccess(c, http.StatusCreated, "Zone created successfully", zone)
}

// GetByID handles GET /api/v1/zones/:id.
func (h *ZoneHandler) GetByID(c echo.Context) error {
	id, err := parseID(c)
	if err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid zone id", err.Error())
	}
	zone, err := h.zoneService.GetByIDWithAvailability(id)
	if err != nil {
		if errors.Is(err, service.ErrZoneNotFound) {
			return utils.JSONError(c, http.StatusNotFound, "Zone not found", err.Error())
		}
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to fetch zone", err.Error())
	}
	return utils.JSONSuccess(c, http.StatusOK, "Zone fetched successfully", zone)
}

// List handles GET /api/v1/zones.
func (h *ZoneHandler) List(c echo.Context) error {
	zones, err := h.zoneService.ListWithAvailability()
	if err != nil {
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to list zones", err.Error())
	}
	return utils.JSONSuccess(c, http.StatusOK, "Zones fetched successfully", zones)
}

// Update handles PUT /api/v1/zones/:id.
func (h *ZoneHandler) Update(c echo.Context) error {
	id, err := parseID(c)
	if err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid zone id", err.Error())
	}
	var req dto.UpdateZoneRequest
	if err := c.Bind(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid request body", err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Validation failed", err.Error())
	}
	zone, err := h.zoneService.Update(id, req)
	if err != nil {
		if errors.Is(err, service.ErrZoneNotFound) {
			return utils.JSONError(c, http.StatusNotFound, "Zone not found", err.Error())
		}
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to update zone", err.Error())
	}
	return utils.JSONSuccess(c, http.StatusOK, "Zone updated successfully", zone)
}

// Delete handles DELETE /api/v1/zones/:id.
func (h *ZoneHandler) Delete(c echo.Context) error {
	id, err := parseID(c)
	if err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid zone id", err.Error())
	}
	if err := h.zoneService.Delete(id); err != nil {
		if errors.Is(err, service.ErrZoneNotFound) {
			return utils.JSONError(c, http.StatusNotFound, "Zone not found", err.Error())
		}
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to delete zone", err.Error())
	}
	return utils.JSONSuccess(c, http.StatusOK, "Zone deleted successfully", nil)
}

func parseID(c echo.Context) (uint, error) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(id), nil
}