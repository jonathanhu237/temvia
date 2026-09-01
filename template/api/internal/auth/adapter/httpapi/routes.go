package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strconv"
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

type PasswordRecoveryService interface {
	Request(context.Context, application.PasswordResetRequestInput) error
	Complete(context.Context, application.PasswordResetCompleteInput) error
}

type AccessService interface {
	Roles(context.Context, string) (application.RolePage, error)
	Role(context.Context, string, string) (domain.Role, error)
	CreateRole(context.Context, string, application.RoleMutationInput) (domain.Role, error)
	ReplaceRole(context.Context, string, string, application.RoleMutationInput) (domain.Role, error)
	DeleteRole(context.Context, string, string) error
	Users(context.Context, string, string, int) (application.UserPage, error)
	ReplaceUserRoles(context.Context, string, string, application.AssignmentInput) (domain.AccessUser, error)
	CreateInvitation(context.Context, string, application.InvitationInput) (domain.Invitation, error)
	Invitations(context.Context, string, string, int) (application.InvitationPage, error)
	ResendInvitation(context.Context, string, string) (domain.Invitation, error)
	RevokeInvitation(context.Context, string, string) error
}

type InvitationAcceptanceService interface {
	Complete(context.Context, string, string) error
}

type Handler struct {
	setup            SetupService
	auth             AuthenticationService
	recovery         PasswordRecoveryService
	access           AccessService
	acceptInvitation InvitationAcceptanceService
	cfg              config.Config
	mux              *http.ServeMux
}

func NewHandler(setup SetupService, auth AuthenticationService, cfg config.Config, recovery ...PasswordRecoveryService) http.Handler {
	return newHandler(setup, auth, cfg, firstRecovery(recovery), nil, nil)
}

func NewHandlerWithAccess(setup SetupService, auth AuthenticationService, cfg config.Config, recovery PasswordRecoveryService, access AccessService, accept InvitationAcceptanceService) http.Handler {
	return newHandler(setup, auth, cfg, recovery, access, accept)
}

func firstRecovery(recovery []PasswordRecoveryService) PasswordRecoveryService {
	var passwordRecovery PasswordRecoveryService
	if len(recovery) > 0 {
		passwordRecovery = recovery[0]
	}
	return passwordRecovery
}

func newHandler(setup SetupService, auth AuthenticationService, cfg config.Config, recovery PasswordRecoveryService, access AccessService, accept InvitationAcceptanceService) http.Handler {
	h := &Handler{setup: setup, auth: auth, recovery: recovery, access: access, acceptInvitation: accept, cfg: cfg, mux: http.NewServeMux()}
	h.mux.HandleFunc("GET /api/setup/status", h.setupStatus)
	h.mux.HandleFunc("POST /api/setup", h.setupComplete)
	h.mux.HandleFunc("POST /api/auth/login", h.login)
	h.mux.HandleFunc("GET /api/auth/me", h.me)
	h.mux.HandleFunc("POST /api/auth/logout", h.logout)
	if h.recovery != nil {
		h.mux.HandleFunc("POST /api/auth/password-reset/request", h.passwordResetRequest)
		h.mux.HandleFunc("POST /api/auth/password-reset/complete", h.passwordResetComplete)
	}
	if h.access != nil {
		h.mux.HandleFunc("GET /api/roles", h.roles)
		h.mux.HandleFunc("GET /api/roles/{id}", h.role)
		h.mux.HandleFunc("POST /api/roles", h.createRole)
		h.mux.HandleFunc("PUT /api/roles/{id}", h.replaceRole)
		h.mux.HandleFunc("DELETE /api/roles/{id}", h.deleteRole)
		h.mux.HandleFunc("GET /api/users", h.users)
		h.mux.HandleFunc("PUT /api/users/{id}/roles", h.replaceUserRoles)
		h.mux.HandleFunc("GET /api/user-invitations", h.invitations)
		h.mux.HandleFunc("POST /api/user-invitations", h.createInvitation)
		h.mux.HandleFunc("POST /api/user-invitations/{id}/resend", h.resendInvitation)
		h.mux.HandleFunc("DELETE /api/user-invitations/{id}", h.revokeInvitation)
	}
	if h.acceptInvitation != nil {
		h.mux.HandleFunc("POST /api/auth/invitations/accept", h.acceptInvitationHandler)
	}
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
		if expected, ok := expectedMethods(r.URL.Path); ok && !methodAllowed(expected, r.Method) {
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
	"/api/setup/status":                 "GET",
	"/api/setup":                        "POST",
	"/api/auth/login":                   "POST",
	"/api/auth/me":                      "GET",
	"/api/auth/logout":                  "POST",
	"/api/auth/password-reset/request":  "POST",
	"/api/auth/password-reset/complete": "POST",
	"/api/roles":                        "GET, POST",
	"/api/users":                        "GET",
	"/api/user-invitations":             "GET, POST",
	"/api/auth/invitations/accept":      "POST",
}

func expectedMethods(path string) (string, bool) {
	if expected, ok := knownMethods[path]; ok {
		return expected, true
	}
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 3 && parts[0] == "api" {
		switch parts[1] {
		case "roles":
			return "GET, PUT, DELETE", true
		case "user-invitations":
			return "DELETE", true
		}
	}
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "user-invitations" && parts[3] == "resend" {
		return "POST", true
	}
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "users" && parts[3] == "roles" {
		return "PUT", true
	}
	return "", false
}

func methodAllowed(expected, actual string) bool {
	for _, method := range strings.Split(expected, ",") {
		if methodMatches(strings.TrimSpace(method), actual) {
			return true
		}
	}
	return false
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
	var user domain.User
	var principal domain.Principal
	var sessionID string
	var err error
	if enriched, ok := h.auth.(application.PrincipalAuthenticationService); ok {
		principal, sessionID, err = enriched.LoginWithPrincipal(r.Context(), input)
		user = principal.User
	} else {
		user, sessionID, err = h.auth.Login(r.Context(), input)
	}
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	h.setSessionCookie(w, sessionID)
	if principal.User.ID != "" {
		writeJSON(w, http.StatusOK, principalResponse(principal))
		return
	}
	writeJSON(w, http.StatusOK, userResponse(user))
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.cfg.CookieName)
	if err != nil {
		writeProblem(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	if enriched, ok := h.auth.(application.PrincipalAuthenticationService); ok {
		principal, err := enriched.CurrentPrincipal(r.Context(), cookie.Value)
		if err != nil {
			writeApplicationError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, principalResponse(principal))
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

func (h *Handler) passwordResetRequest(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		writeProblem(w, http.StatusForbidden, "forbidden")
		return
	}
	var input application.PasswordResetRequestInput
	if err := decodeJSONObject(r, &input, map[string]struct{}{"email": {}, "locale": {}}); err != nil {
		writeDecodeError(w, err)
		return
	}
	if err := h.recovery.Request(r.Context(), input); err != nil {
		writeApplicationError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}

func (h *Handler) passwordResetComplete(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		writeProblem(w, http.StatusForbidden, "forbidden")
		return
	}
	var input application.PasswordResetCompleteInput
	if err := decodeJSONObject(r, &input, map[string]struct{}{"token": {}, "password": {}, "locale": {}}); err != nil {
		var fieldErr fieldValueError
		if errors.As(err, &fieldErr) && fieldErr.field == "token" {
			writeProblem(w, http.StatusForbidden, "invalid-password-reset-token")
			return
		}
		writeDecodeError(w, err)
		return
	}
	if err := h.recovery.Complete(r.Context(), input); err != nil {
		writeApplicationError(w, err)
		return
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

func (h *Handler) currentPrincipal(r *http.Request) (domain.Principal, error) {
	cookie, err := r.Cookie(h.cfg.CookieName)
	if err != nil {
		return domain.Principal{}, application.ErrUnauthenticated
	}
	if enriched, ok := h.auth.(application.PrincipalAuthenticationService); ok {
		return enriched.CurrentPrincipal(r.Context(), cookie.Value)
	}
	user, err := h.auth.Current(r.Context(), cookie.Value)
	if err != nil {
		return domain.Principal{}, err
	}
	return domain.Principal{User: user}, nil
}

func (h *Handler) roles(w http.ResponseWriter, r *http.Request) {
	principal, err := h.currentPrincipal(r)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	result, err := h.access.Roles(r.Context(), principal.User.ID)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	roles := make([]roleResponseBody, 0, len(result.Items))
	for _, role := range result.Items {
		roles = append(roles, roleResponse(role))
	}
	permissions := make([]permissionResponseBody, 0, len(result.Catalog))
	for _, definition := range result.Catalog {
		permissions = append(permissions, permissionResponseBody{Key: string(definition.Key), Resource: definition.Resource, Action: definition.Action, LabelKey: definition.LabelKey, Description: definition.Description})
	}
	writeJSON(w, http.StatusOK, roleListResponse{Roles: roles, Permissions: permissions})
}

func (h *Handler) role(w http.ResponseWriter, r *http.Request) {
	principal, err := h.currentPrincipal(r)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	id := r.PathValue("id")
	if !domain.IsCanonicalUUID(id) {
		writeProblem(w, http.StatusNotFound, "not-found")
		return
	}
	item, err := h.access.Role(r.Context(), principal.User.ID, id)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, roleEnvelope{Role: roleResponse(item)})
}

type roleMutationRequest struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Permissions []domain.PermissionKey `json:"permissions"`
	Revision    *int64                 `json:"revision"`
}

func (h *Handler) createRole(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		writeProblem(w, http.StatusForbidden, "forbidden")
		return
	}
	principal, err := h.currentPrincipal(r)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	var input roleMutationRequest
	if err := decodeJSONObject(r, &input, map[string]struct{}{"name": {}, "description": {}, "permissions": {}}); err != nil {
		writeDecodeError(w, err)
		return
	}
	item, err := h.access.CreateRole(r.Context(), principal.User.ID, application.RoleMutationInput{Name: input.Name, Description: input.Description, Permissions: input.Permissions})
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, roleEnvelope{Role: roleResponse(item)})
}

func (h *Handler) replaceRole(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		writeProblem(w, http.StatusForbidden, "forbidden")
		return
	}
	principal, err := h.currentPrincipal(r)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	var input roleMutationRequest
	if err := decodeJSONObject(r, &input, map[string]struct{}{"name": {}, "description": {}, "permissions": {}, "revision": {}}); err != nil {
		writeDecodeError(w, err)
		return
	}
	id := r.PathValue("id")
	if !domain.IsCanonicalUUID(id) {
		writeProblem(w, http.StatusNotFound, "not-found")
		return
	}
	if input.Revision == nil {
		writeProblemWithCode(w, http.StatusUnprocessableEntity, "validation-failed", "validation_failed", "", []domain.FieldError{{Field: "revision", Code: "required"}})
		return
	}
	item, err := h.access.ReplaceRole(r.Context(), principal.User.ID, id, application.RoleMutationInput{Name: input.Name, Description: input.Description, Permissions: input.Permissions, Revision: *input.Revision})
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, roleEnvelope{Role: roleResponse(item)})
}

func (h *Handler) deleteRole(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		writeProblem(w, http.StatusForbidden, "forbidden")
		return
	}
	principal, err := h.currentPrincipal(r)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	id := r.PathValue("id")
	if !domain.IsCanonicalUUID(id) {
		writeProblem(w, http.StatusNotFound, "not-found")
		return
	}
	if err := h.access.DeleteRole(r.Context(), principal.User.ID, id); err != nil {
		writeApplicationError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parsePageQuery(r *http.Request) (string, int, error) {
	query := r.URL.Query()
	cursor := query.Get("cursor")
	limit := 25
	if raw := query.Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return "", 0, &domain.ValidationErrors{Items: []domain.FieldError{{Field: "limit", Code: "invalid_limit"}}}
		}
		limit = parsed
	}
	if cursor != "" && !domain.IsCanonicalUUID(cursor) {
		return "", 0, &domain.ValidationErrors{Items: []domain.FieldError{{Field: "cursor", Code: "invalid_cursor"}}}
	}
	if limit < 1 || limit > 100 {
		return "", 0, &domain.ValidationErrors{Items: []domain.FieldError{{Field: "limit", Code: "invalid_limit"}}}
	}
	return cursor, limit, nil
}

func (h *Handler) users(w http.ResponseWriter, r *http.Request) {
	principal, err := h.currentPrincipal(r)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	cursor, limit, err := parsePageQuery(r)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	page, err := h.access.Users(r.Context(), principal.User.ID, cursor, limit)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	items := make([]accessUserResponseBody, 0, len(page.Items))
	for _, item := range page.Items {
		items = append(items, accessUserResponse(item))
	}
	writeJSON(w, http.StatusOK, usersResponse{Users: items, NextCursor: page.NextCursor})
}

type assignmentRequest struct {
	RoleIDs     []string `json:"roleIds"`
	AuthVersion *int64   `json:"authVersion"`
}

func (h *Handler) replaceUserRoles(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		writeProblem(w, http.StatusForbidden, "forbidden")
		return
	}
	principal, err := h.currentPrincipal(r)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	var input assignmentRequest
	if err := decodeJSONObject(r, &input, map[string]struct{}{"roleIds": {}, "authVersion": {}}); err != nil {
		writeDecodeError(w, err)
		return
	}
	id := r.PathValue("id")
	if !domain.IsCanonicalUUID(id) {
		writeProblem(w, http.StatusNotFound, "not-found")
		return
	}
	if input.AuthVersion == nil {
		writeProblemWithCode(w, http.StatusUnprocessableEntity, "validation-failed", "validation_failed", "", []domain.FieldError{{Field: "authVersion", Code: "required"}})
		return
	}
	item, err := h.access.ReplaceUserRoles(r.Context(), principal.User.ID, id, application.AssignmentInput{RoleIDs: input.RoleIDs, AuthVersion: *input.AuthVersion})
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]accessUserResponseBody{"user": accessUserResponse(item)})
}

func (h *Handler) invitations(w http.ResponseWriter, r *http.Request) {
	principal, err := h.currentPrincipal(r)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	cursor, limit, err := parsePageQuery(r)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	page, err := h.access.Invitations(r.Context(), principal.User.ID, cursor, limit)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	items := make([]invitationResponseBody, 0, len(page.Items))
	for _, item := range page.Items {
		items = append(items, invitationResponse(item))
	}
	writeJSON(w, http.StatusOK, invitationsResponse{Invitations: items, NextCursor: page.NextCursor})
}

type invitationRequest struct {
	Name    string   `json:"name"`
	Email   string   `json:"email"`
	Locale  string   `json:"locale"`
	RoleIDs []string `json:"roleIds"`
}

func (h *Handler) createInvitation(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		writeProblem(w, http.StatusForbidden, "forbidden")
		return
	}
	principal, err := h.currentPrincipal(r)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	var input invitationRequest
	if err := decodeJSONObject(r, &input, map[string]struct{}{"name": {}, "email": {}, "locale": {}, "roleIds": {}}); err != nil {
		writeDecodeError(w, err)
		return
	}
	item, err := h.access.CreateInvitation(r.Context(), principal.User.ID, application.InvitationInput{Name: input.Name, Email: input.Email, Locale: input.Locale, RoleIDs: input.RoleIDs})
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]invitationResponseBody{"invitation": invitationResponse(item)})
}

func (h *Handler) resendInvitation(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		writeProblem(w, http.StatusForbidden, "forbidden")
		return
	}
	principal, err := h.currentPrincipal(r)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	id := r.PathValue("id")
	if !domain.IsCanonicalUUID(id) {
		writeProblem(w, http.StatusNotFound, "not-found")
		return
	}
	item, err := h.access.ResendInvitation(r.Context(), principal.User.ID, id)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]invitationResponseBody{"invitation": invitationResponse(item)})
}

func (h *Handler) revokeInvitation(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		writeProblem(w, http.StatusForbidden, "forbidden")
		return
	}
	principal, err := h.currentPrincipal(r)
	if err != nil {
		writeApplicationError(w, err)
		return
	}
	id := r.PathValue("id")
	if !domain.IsCanonicalUUID(id) {
		writeProblem(w, http.StatusNotFound, "not-found")
		return
	}
	if err := h.access.RevokeInvitation(r.Context(), principal.User.ID, id); err != nil {
		writeApplicationError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) acceptInvitationHandler(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		writeProblem(w, http.StatusForbidden, "forbidden")
		return
	}
	var input struct {
		Token    string `json:"token"`
		Password string `json:"password"`
		Locale   string `json:"locale"`
	}
	if err := decodeJSONObject(r, &input, map[string]struct{}{"token": {}, "password": {}, "locale": {}}); err != nil {
		var fieldErr fieldValueError
		if errors.As(err, &fieldErr) && strings.EqualFold(fieldErr.field, "token") {
			writeProblem(w, http.StatusForbidden, "invalid-invitation")
			return
		}
		writeDecodeError(w, err)
		return
	}
	if !domain.Locale(input.Locale).Valid() {
		writeProblemWithCode(w, http.StatusUnprocessableEntity, "validation-failed", "validation_failed", "", []domain.FieldError{{Field: "locale", Code: "invalid_locale"}})
		return
	}
	if err := h.acceptInvitation.Complete(r.Context(), input.Token, input.Password); err != nil {
		writeApplicationError(w, err)
		return
	}
	h.clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}
