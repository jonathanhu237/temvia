package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"example.com/temvia/api/internal/auth/application"
	"example.com/temvia/api/internal/auth/domain"
	"example.com/temvia/api/internal/config"
)

type SetupService interface {
	Status(context.Context) (application.SetupStatus, error)
	Complete(context.Context, application.SetupInput) (domain.User, error)
}

type AuthenticationService interface {
	Login(context.Context, application.LoginInput) (domain.User, string, error)
	Current(context.Context, string) (domain.User, error)
	Logout(context.Context, string) error
}

type Handler struct {
	setup SetupService
	auth  AuthenticationService
	cfg   config.Config
	mux   *http.ServeMux
}

func NewHandler(setup SetupService, auth AuthenticationService, cfg config.Config) http.Handler {
	h := &Handler{setup: setup, auth: auth, cfg: cfg, mux: http.NewServeMux()}
	h.mux.HandleFunc("GET /api/setup/status", h.setupStatus)
	h.mux.HandleFunc("POST /api/setup", h.setupComplete)
	h.mux.HandleFunc("POST /api/auth/login", h.login)
	h.mux.HandleFunc("GET /api/auth/me", h.me)
	h.mux.HandleFunc("POST /api/auth/logout", h.logout)
	h.mux.HandleFunc("/api/", h.notFound)
	return h
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api" {
		w.Header().Set("Cache-Control", "no-store")
		writeProblem(w, http.StatusNotFound, "not-found")
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/") {
		w.Header().Set("Cache-Control", "no-store")
		if expected, ok := knownMethods[r.URL.Path]; ok && !methodMatches(expected, r.Method) {
			w.Header().Set("Allow", expected)
			writeProblem(w, http.StatusMethodNotAllowed, "method-not-allowed")
			return
		}
	}
	h.mux.ServeHTTP(w, r)
}

func methodMatches(expected, actual string) bool {
	return expected == actual || (expected == http.MethodGet && actual == http.MethodHead)
}

var knownMethods = map[string]string{
	"/api/setup/status": "GET",
	"/api/setup":        "POST",
	"/api/auth/login":   "POST",
	"/api/auth/me":      "GET",
	"/api/auth/logout":  "POST",
}

func (h *Handler) setupStatus(w http.ResponseWriter, r *http.Request) {
	status, err := h.setup.Status(r.Context())
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": string(status)})
}

func (h *Handler) setupComplete(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		writeProblem(w, http.StatusForbidden, "forbidden")
		return
	}
	var input application.SetupInput
	if err := decodeJSONObject(r, &input, map[string]struct{}{"token": {}, "name": {}, "email": {}, "password": {}}); err != nil {
		var fieldErr fieldValueError
		if errors.As(err, &fieldErr) && fieldErr.field == "token" {
			writeProblem(w, http.StatusForbidden, "invalid-setup-token")
			return
		}
		writeDecodeError(w, err)
		return
	}
	_, err := h.setup.Complete(r.Context(), input)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": string(application.SetupComplete)})
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		writeProblem(w, http.StatusForbidden, "forbidden")
		return
	}
	var input application.LoginInput
	if err := decodeJSONObject(r, &input, map[string]struct{}{"email": {}, "password": {}}); err != nil {
		writeDecodeError(w, err)
		return
	}
	user, sessionID, err := h.auth.Login(r.Context(), input)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	h.setSessionCookie(w, sessionID)
	writeJSON(w, http.StatusOK, userResponse(user))
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.cfg.CookieName)
	if err != nil {
		writeProblem(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	user, err := h.auth.Current(r.Context(), cookie.Value)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, userResponse(user))
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		writeProblem(w, http.StatusForbidden, "forbidden")
		return
	}
	cookie, err := r.Cookie(h.cfg.CookieName)
	if err == nil {
		if err := h.auth.Logout(r.Context(), cookie.Value); err != nil {
			writeApplicationError(w, err)
			return
		}
	}
	h.clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) notFound(w http.ResponseWriter, _ *http.Request) {
	writeProblem(w, http.StatusNotFound, "not-found")
}

func (h *Handler) validOrigin(r *http.Request) bool {
	values := r.Header.Values("Origin")
	if len(values) != 1 {
		return false
	}
	value := values[0]
	if value == "" || strings.EqualFold(value, "null") {
		return false
	}
	origin, err := config.CanonicalOrigin(value)
	return err == nil && origin == h.cfg.Origin
}
