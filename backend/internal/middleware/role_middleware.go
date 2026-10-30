package middleware

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"spotsync-backend/pkg/utils"
)

// AdminOnly returns a middleware that ensures the authenticated user has the
// "admin" role. Must be chained AFTER AuthMiddleware.
func AdminOnly() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if !IsAdminFromContext(c) {
				return utils.JSONError(c, http.StatusForbidden, "Forbidden", "admin role required")
			}
			return next(c)
		}
	}
}

// IncidentStaffOnly permits admins and staff to manage incident workflows.
// The current registration flow only creates drivers/admins; staff accounts
// must be provisioned by an administrator.
func IncidentStaffOnly() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			role, _ := c.Get(CtxRole).(string)
			if role != "admin" && role != "staff" {
				return utils.JSONError(c, http.StatusForbidden, "Forbidden", "staff or admin role required")
			}
			return next(c)
		}
	}
}
