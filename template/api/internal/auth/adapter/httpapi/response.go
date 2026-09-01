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

type roleResponseBody struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	System          string   `json:"system,omitempty"`
	Permissions     []string `json:"permissions"`
	Revision        int64    `json:"revision"`
	AssignmentCount int      `json:"assignmentCount,omitempty"`
	CreatedAt       string   `json:"createdAt,omitempty"`
	UpdatedAt       string   `json:"updatedAt,omitempty"`
}

type principalResponseBody struct {
	User        userResponseBody   `json:"user"`
	Roles       []roleResponseBody `json:"roles"`
	Permissions []string           `json:"permissions"`
	SuperAdmin  bool               `json:"superAdmin"`
}

type principalEnvelope struct {
	User        userResponseBody   `json:"user"`
	Roles       []roleResponseBody `json:"roles"`
	Permissions []string           `json:"permissions"`
	SuperAdmin  bool               `json:"superAdmin"`
}

type roleListResponse struct {
	Roles       []roleResponseBody       `json:"roles"`
	Permissions []permissionResponseBody `json:"permissions"`
}

type permissionResponseBody struct {
	Key         string `json:"key"`
	Resource    string `json:"resource"`
	Action      string `json:"action"`
	LabelKey    string `json:"labelKey"`
	Description string `json:"description"`
}

type roleEnvelope struct {
	Role roleResponseBody `json:"role"`
}

type accessUserResponseBody struct {
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	Email       string             `json:"email"`
	CreatedAt   string             `json:"createdAt"`
	AuthVersion int64              `json:"authVersion"`
	Roles       []roleResponseBody `json:"roles"`
}

type usersResponse struct {
	Users      []accessUserResponseBody `json:"users"`
	NextCursor string                   `json:"nextCursor,omitempty"`
}

type invitationResponseBody struct {
	ID        string             `json:"id"`
	Name      string             `json:"name"`
	Email     string             `json:"email"`
	Locale    string             `json:"locale"`
	Roles     []roleResponseBody `json:"roles"`
	ExpiresAt string             `json:"expiresAt"`
	CreatedAt string             `json:"createdAt"`
	Revision  int64              `json:"revision"`
}

type invitationsResponse struct {
	Invitations []invitationResponseBody `json:"invitations"`
	NextCursor  string                   `json:"nextCursor,omitempty"`
}

func principalResponse(principal domain.Principal) principalEnvelope {
	roles := make([]roleResponseBody, 0, len(principal.Roles))
	for _, role := range principal.Roles {
		roles = append(roles, roleResponse(role))
	}
	permissions := make([]string, 0, len(principal.Permissions))
	for _, permission := range principal.Permissions {
		permissions = append(permissions, string(permission))
	}
	return principalEnvelope{User: userResponseBody{ID: principal.User.ID, Name: principal.User.Name, Email: principal.User.Email}, Roles: roles, Permissions: permissions, SuperAdmin: principal.SuperAdmin}
}

func roleResponse(role domain.Role) roleResponseBody {
	permissions := make([]string, 0, len(role.Permissions))
	for _, permission := range role.Permissions {
		permissions = append(permissions, string(permission))
	}
	body := roleResponseBody{ID: role.ID, Name: role.Name, Description: role.Description, System: role.SystemKey, Permissions: permissions, Revision: role.Revision, AssignmentCount: role.AssignmentCount}
	if !role.CreatedAt.IsZero() {
		body.CreatedAt = role.CreatedAt.UTC().Format(time.RFC3339Nano)
	}
	if !role.UpdatedAt.IsZero() {
		body.UpdatedAt = role.UpdatedAt.UTC().Format(time.RFC3339Nano)
	}
	return body
}

func accessUserResponse(user domain.AccessUser) accessUserResponseBody {
	roles := make([]roleResponseBody, 0, len(user.Roles))
	for _, role := range user.Roles {
		roles = append(roles, roleResponse(role))
	}
	return accessUserResponseBody{ID: user.User.ID, Name: user.User.Name, Email: user.User.Email, CreatedAt: user.User.CreatedAt.UTC().Format(time.RFC3339Nano), AuthVersion: user.AuthVersion, Roles: roles}
}

func invitationResponse(invitation domain.Invitation) invitationResponseBody {
	roles := make([]roleResponseBody, 0, len(invitation.Roles))
	for _, role := range invitation.Roles {
		roles = append(roles, roleResponse(role))
	}
	return invitationResponseBody{ID: invitation.ID, Name: invitation.Name, Email: invitation.Email, Locale: string(invitation.Locale), Roles: roles, ExpiresAt: invitation.ExpiresAt.UTC().Format(time.RFC3339Nano), CreatedAt: invitation.CreatedAt.UTC().Format(time.RFC3339Nano), Revision: invitation.Revision}
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
