package errors

import (
	"fmt"
	"net/http"
)

// AppError represents a structured application error with HTTP status mapping.
type AppError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
	Err     error  `json:"-"`
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

func (e *AppError) Unwrap() error {
	return e.Err
}

// Constructor helpers for common error types.

func BadRequest(msg string) *AppError {
	return &AppError{Code: http.StatusBadRequest, Message: msg}
}

func BadRequestf(format string, args ...interface{}) *AppError {
	return &AppError{Code: http.StatusBadRequest, Message: fmt.Sprintf(format, args...)}
}

func Unauthorized(msg string) *AppError {
	return &AppError{Code: http.StatusUnauthorized, Message: msg}
}

func Forbidden(msg string) *AppError {
	return &AppError{Code: http.StatusForbidden, Message: msg}
}

func NotFound(msg string) *AppError {
	return &AppError{Code: http.StatusNotFound, Message: msg}
}

func NotFoundf(format string, args ...interface{}) *AppError {
	return &AppError{Code: http.StatusNotFound, Message: fmt.Sprintf(format, args...)}
}

func Conflict(msg string) *AppError {
	return &AppError{Code: http.StatusConflict, Message: msg}
}

func TooManyRequests(msg string) *AppError {
	return &AppError{Code: http.StatusTooManyRequests, Message: msg}
}

func Internal(msg string, err error) *AppError {
	return &AppError{Code: http.StatusInternalServerError, Message: msg, Err: err}
}

func Internalf(err error, format string, args ...interface{}) *AppError {
	return &AppError{
		Code:    http.StatusInternalServerError,
		Message: fmt.Sprintf(format, args...),
		Err:     err,
	}
}

func ServiceUnavailable(msg string) *AppError {
	return &AppError{Code: http.StatusServiceUnavailable, Message: msg}
}

// Wrap wraps an existing error with an AppError at a specific HTTP status.
func Wrap(err error, code int, msg string) *AppError {
	return &AppError{Code: code, Message: msg, Err: err}
}

// IsAppError checks if an error is an AppError and returns it.
func IsAppError(err error) (*AppError, bool) {
	if appErr, ok := err.(*AppError); ok {
		return appErr, true
	}
	return nil, false
}
