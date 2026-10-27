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

// AuthHandler exposes HTTP handlers for the authentication endpoints.
type AuthHandler struct {
	authService service.AuthService
}

// NewAuthHandler wires an AuthHandler bound to the given AuthService.
func NewAuthHandler(authService service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

// ListUsers handles GET /api/v1/auth/users (admin only).
//
// Returns every registered user so the admin dashboard can render the user
// roster and per-role KPIs. Must be guarded by AdminOnly() at the route
// level — this handler does not re-check the role itself.
func (h *AuthHandler) ListUsers(c echo.Context) error {
	users, err := h.authService.ListAllUsers()
	if err != nil {
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to list users", err.Error())
	}
	return utils.JSONSuccess(c, http.StatusOK, "Users fetched successfully", users)
}

// CountUsersByRole handles GET /api/v1/auth/users/count?role=driver (admin only).
//
// Returns the number of users with the given role. Used by the admin
// dashboard to summarize drivers vs admins.
func (h *AuthHandler) CountUsersByRole(c echo.Context) error {
	role := c.QueryParam("role")
	if role == "" {
		return utils.JSONError(c, http.StatusBadRequest, "Missing role query parameter", "role is required")
	}
	if role != "driver" && role != "admin" {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid role", "role must be 'driver' or 'admin'")
	}
	count, err := h.authService.CountUsersByRole(role)
	if err != nil {
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to count users", err.Error())
	}
	return utils.JSONSuccess(c, http.StatusOK, "User count fetched successfully", map[string]int64{"count": count})
}

// Register handles POST /api/v1/auth/register.
func (h *AuthHandler) Register(c echo.Context) error {
	var req dto.RegisterRequest
	if err := c.Bind(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid request body", err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Validation failed", err.Error())
	}

	user, err := h.authService.Register(req)
	if err != nil {
		if errors.Is(err, service.ErrEmailAlreadyExists) {
			return utils.JSONError(c, http.StatusBadRequest, "Email already exists", err.Error())
		}
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to register user", err.Error())
	}

	return utils.JSONSuccess(c, http.StatusCreated, "User registered successfully", user)
}

// Login handles POST /api/v1/auth/login.
func (h *AuthHandler) Login(c echo.Context) error {
	var req dto.LoginRequest
	if err := c.Bind(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid request body", err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return utils.JSONError(c, http.StatusBadRequest, "Validation failed", err.Error())
	}

	resp, err := h.authService.Login(req)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			return utils.JSONError(c, http.StatusUnauthorized, "Invalid email or password", err.Error())
		}
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to login", err.Error())
	}

	return utils.JSONSuccess(c, http.StatusOK, "Login successful", resp)
}

// DeleteUser handles DELETE /api/v1/auth/users/:id (admin only).
//
// Removes the user with the given numeric ID. Returns 404 when the user
// does not exist. The route is already gated by AdminOnly() middleware,
// so the role check is not repeated here.
func (h *AuthHandler) DeleteUser(c echo.Context) error {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		return utils.JSONError(c, http.StatusBadRequest, "Invalid user id", err.Error())
	}
	if err := h.authService.DeleteUser(uint(id)); err != nil {
		if errors.Is(err, service.ErrUserNotFound) {
			return utils.JSONError(c, http.StatusNotFound, "User not found", err.Error())
		}
		return utils.JSONError(c, http.StatusInternalServerError, "Failed to delete user", err.Error())
	}
	return utils.JSONSuccess(c, http.StatusOK, "User deleted successfully", nil)
}