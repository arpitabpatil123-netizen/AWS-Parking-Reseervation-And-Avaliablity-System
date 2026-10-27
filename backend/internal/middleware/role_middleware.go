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