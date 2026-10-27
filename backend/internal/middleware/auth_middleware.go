package middleware

import (
	"errors"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"

	"spotsync-backend/pkg/utils"
)

// Context keys used to propagate authenticated user info to downstream handlers.
const (
	CtxUserID  = "auth_user_id"
	CtxRole    = "auth_role"
	CtxIsAdmin = "auth_is_admin"
)

// AuthMiddleware validates the Bearer token in the Authorization header and
// populates Echo's request context with the user's ID and role. Expired
// tokens (failed `exp` validation) are rejected with 401 Unauthorized.
func AuthMiddleware(jwtSecret string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader == "" {
				return utils.JSONError(c, http.StatusUnauthorized, "Unauthorized", "missing Authorization header")
			}
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
				return utils.JSONError(c, http.StatusUnauthorized, "Unauthorized", "invalid Authorization header")
			}
			claims, err := utils.ValidateToken(parts[1], jwtSecret)
			if err != nil {
				// Surface a specific message for expired tokens so clients can
				// distinguish "renew me" from "you're unauthenticated", while
				// still answering 401 in every failure case.
				msg := "invalid or expired token"
				if errors.Is(err, jwt.ErrTokenExpired) {
					msg = "token has expired"
				}
				return utils.JSONError(c, http.StatusUnauthorized, "Unauthorized", msg)
			}
			c.Set(CtxUserID, claims.UserID)
			c.Set(CtxRole, claims.Role)
			c.Set(CtxIsAdmin, claims.Role == "admin")
			return next(c)
		}
	}
}

// UserIDFromContext returns the authenticated user ID stored by AuthMiddleware.
func UserIDFromContext(c echo.Context) (uint, bool) {
	v := c.Get(CtxUserID)
	if v == nil {
		return 0, false
	}
	id, ok := v.(uint)
	return id, ok
}

// IsAdminFromContext returns whether the authenticated user has admin role.
func IsAdminFromContext(c echo.Context) bool {
	v := c.Get(CtxIsAdmin)
	if v == nil {
		return false
	}
	isAdmin, ok := v.(bool)
	return ok && isAdmin
}