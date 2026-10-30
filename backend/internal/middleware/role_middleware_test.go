package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestIncidentStaffOnly(t *testing.T) {
	tests := []struct {
		role       string
		wantStatus int
	}{
		{role: "driver", wantStatus: http.StatusForbidden},
		{role: "admin", wantStatus: http.StatusNoContent},
		{role: "staff", wantStatus: http.StatusNoContent},
	}

	for _, tt := range tests {
		t.Run(tt.role, func(t *testing.T) {
			e := echo.New()
			setRole := func(next echo.HandlerFunc) echo.HandlerFunc {
				return func(c echo.Context) error {
					c.Set(CtxRole, tt.role)
					return next(c)
				}
			}
			e.GET("/incidents", func(c echo.Context) error {
				return c.NoContent(http.StatusNoContent)
			}, setRole, IncidentStaffOnly())

			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/incidents", nil)
			e.ServeHTTP(recorder, request)
			if recorder.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", recorder.Code, tt.wantStatus)
			}
		})
	}
}
