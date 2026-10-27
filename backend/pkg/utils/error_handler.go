package utils

import (
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
)

// CustomHTTPErrorHandler is the centralized HTTP error handler that converts
// all errors (including framework errors, route 404s, invalid JSON binding,
// and internal panics caught by middleware.Recover) into the standardized
// API JSON envelope:
//
//	{
//	  "success": false,
//	  "message": "...",
//	  "errors":  "..."
//	}
//
// It should be attached to the Echo instance via `e.HTTPErrorHandler = utils.CustomHTTPErrorHandler`.
func CustomHTTPErrorHandler(err error, c echo.Context) {
	code := http.StatusInternalServerError
	msg := "Internal Server Error"
	errDetail := err.Error()

	// If the error is an Echo HTTPError (e.g. 404 from no matching route,
	// 405 from wrong method, or a manually thrown `echo.NewHTTPError(...)`),
	// propagate its code/message in our standard envelope.
	if he, ok := err.(*echo.HTTPError); ok {
		code = he.Code
		if m, ok := he.Message.(string); ok {
			msg = m
		} else {
			msg = fmt.Sprintf("%v", he.Message)
		}
	}

	// Make sure the response is not committed before writing the envelope.
	if !c.Response().Committed {
		_ = c.JSON(code, map[string]interface{}{
			"success": false,
			"message": msg,
			"errors":  errDetail,
		})
	}
}