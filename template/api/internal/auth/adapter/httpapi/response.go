package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"example.com/temvia/api/internal/auth/domain"
)

type userEnvelope struct {
	User userResponseBody `json:"user"`
}

type userResponseBody struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

func userResponse(user domain.User) userEnvelope {
	return userEnvelope{User: userResponseBody{ID: user.ID, Name: user.Name, Email: user.Email}}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeDecodeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errBodyTooLarge):
		writeProblem(w, http.StatusRequestEntityTooLarge, "content-too-large")
	case errors.Is(err, errUnsupportedMedia):
		writeProblem(w, http.StatusUnsupportedMediaType, "unsupported-media-type")
	default:
		var fieldErr fieldValueError
		if errors.As(err, &fieldErr) {
			writeProblemWithCode(w, http.StatusUnprocessableEntity, "validation-failed", "validation_failed", "", []domain.FieldError{{Field: fieldErr.field, Code: "invalid_value"}})
			return
		}
		writeProblem(w, http.StatusBadRequest, "invalid-request")
	}
}

func (h *Handler) setSessionCookie(w http.ResponseWriter, value string) {
	http.SetCookie(w, &http.Cookie{
		Name:     h.cfg.CookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.cfg.SecureCookie,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *Handler) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     h.cfg.CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   h.cfg.SecureCookie,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Unix(1, 0),
		MaxAge:   -1,
	})
}
