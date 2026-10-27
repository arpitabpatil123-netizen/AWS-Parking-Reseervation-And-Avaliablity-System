package utils

import "github.com/labstack/echo/v4"

// JSONSuccess writes a standardized success response to the Echo context.
// Response shape:
//
//	{
//	  "success": true,
//	  "message": "Operation successful",
//	  "data":    { ... }
//	}
func JSONSuccess(c echo.Context, code int, message string, data interface{}) error {
	return c.JSON(code, map[string]interface{}{
		"success": true,
		"message": message,
		"data":    data,
	})
}

// JSONError writes a standardized error response to the Echo context.
// Response shape:
//
//	{
//	  "success": false,
//	  "message": "Error message",
//	  "errors":  "Detailed error string"
//	}
func JSONError(c echo.Context, code int, message string, err string) error {
	return c.JSON(code, map[string]interface{}{
		"success": false,
		"message": message,
		"errors":  err,
	})
}
