package utils

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
)

// CustomValidator wraps go-playground/validator so it satisfies the
// echo.Validator interface, enabling automatic request validation via
// c.Validate(req) in handlers.
type CustomValidator struct {
	validator *validator.Validate
}

// NewValidator constructs a CustomValidator with sensible defaults.
func NewValidator() *CustomValidator {
	return &CustomValidator{
		validator: validator.New(),
	}
}

// Validate implements echo.Validator. It runs struct-tag validation and
// converts the resulting errors into a friendly HTTP 400 response. Any
// non-validation error is returned as-is.
func (cv *CustomValidator) Validate(i interface{}) error {
	if err := cv.validator.Struct(i); err != nil {
		// Build a human-readable list of validation errors.
		var messages []string
		if vErrs, ok := err.(validator.ValidationErrors); ok {
			for _, vErr := range vErrs {
				messages = append(messages, formatValidationError(vErr))
			}
		} else {
			messages = append(messages, err.Error())
		}

		return echo.NewHTTPError(
			http.StatusBadRequest,
			strings.Join(messages, "; "),
		)
	}
	return nil
}

func formatValidationError(vErr validator.FieldError) string {
	field := vErr.Field()
	switch vErr.Tag() {
	case "required":
		return fmt.Sprintf("%s is required", field)
	case "email":
		return fmt.Sprintf("%s must be a valid email address", field)
	case "min":
		return fmt.Sprintf("%s must be at least %s characters", field, vErr.Param())
	case "max":
		return fmt.Sprintf("%s must be at most %s characters", field, vErr.Param())
	case "gt":
		return fmt.Sprintf("%s must be greater than %s", field, vErr.Param())
	case "oneof":
		return fmt.Sprintf("%s must be one of [%s]", field, vErr.Param())
	default:
		return fmt.Sprintf("%s is invalid (%s)", field, vErr.Tag())
	}
}
