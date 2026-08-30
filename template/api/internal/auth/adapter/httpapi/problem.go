package httpapi

import (
	"encoding/json"
	"net/http"

	"example.com/temvia/api/internal/auth/application"
	"example.com/temvia/api/internal/auth/domain"
)

type problem struct {
	Type   string         `json:"type"`
	Title  string         `json:"title"`
	Status int            `json:"status"`
	Code   string         `json:"code,omitempty"`
	Detail string         `json:"detail,omitempty"`
	Errors []fieldProblem `json:"errors,omitempty"`
}

type fieldProblem struct {
	Pointer string         `json:"pointer"`
	Code    string         `json:"code"`
	Params  map[string]any `json:"params,omitempty"`
}

var problemCatalog = map[string]struct {
	title string
}{
	"invalid-request":        {"Invalid Request"},
	"invalid-credentials":    {"Invalid Credentials"},
	"unauthenticated":        {"Unauthenticated"},
	"forbidden":              {"Forbidden"},
	"invalid-setup-token":    {"Invalid Setup Token"},
	"not-found":              {"Not Found"},
	"method-not-allowed":     {"Method Not Allowed"},
	"setup-complete":         {"Setup Complete"},
	"content-too-large":      {"Content Too Large"},
	"unsupported-media-type": {"Unsupported Media Type"},
	"validation-failed":      {"Validation Failed"},
	"rate-limited":           {"Too Many Requests"},
	"internal-error":         {"Internal Server Error"},
	"service-unavailable":    {"Service Unavailable"},
}

func writeProblem(w http.ResponseWriter, status int, name string) {
	writeProblemWithCode(w, status, name, "", "", nil)
}

func writeProblemWithCode(w http.ResponseWriter, status int, name, code, detail string, fields []domain.FieldError) {
	catalog, ok := problemCatalog[name]
	if !ok {
		name = "internal-error"
		catalog = problemCatalog[name]
		status = http.StatusInternalServerError
		code, detail, fields = "", "", nil
	}
	body := problem{Type: "/problems/" + name, Title: catalog.title, Status: status, Code: code, Detail: detail}
	for _, field := range fields {
		body.Errors = append(body.Errors, fieldProblem{Pointer: "/" + field.Field, Code: field.Code, Params: field.Params})
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeApplicationError(w http.ResponseWriter, err error) {
	switch {
	case err == nil:
		return
	case isValidation(err):
		writeProblemWithCode(w, http.StatusUnprocessableEntity, "validation-failed", "validation_failed", "", validationFields(err))
	case applicationError(err, application.ErrInvalidCredentials):
		writeProblem(w, http.StatusUnauthorized, "invalid-credentials")
	case applicationError(err, application.ErrUnauthenticated):
		writeProblem(w, http.StatusUnauthorized, "unauthenticated")
	case applicationError(err, application.ErrInvalidSetupToken):
		writeProblem(w, http.StatusForbidden, "invalid-setup-token")
	case applicationError(err, application.ErrSetupComplete):
		writeProblem(w, http.StatusConflict, "setup-complete")
	case applicationError(err, application.ErrEmailAlreadyRegistered):
		writeProblemWithCode(w, http.StatusUnprocessableEntity, "validation-failed", "validation_failed", "", []domain.FieldError{{Field: "email", Code: "email_already_registered"}})
	case applicationError(err, application.ErrRateLimited):
		writeProblemWithCode(w, http.StatusTooManyRequests, "rate-limited", "rate_limited", "", nil)
	case applicationError(err, application.ErrDependencyUnavailable), applicationError(err, application.ErrPasswordHashBusy):
		writeProblem(w, http.StatusServiceUnavailable, "service-unavailable")
	default:
		writeProblem(w, http.StatusInternalServerError, "internal-error")
	}
}

func isValidation(err error) bool {
	_, ok := err.(*domain.ValidationErrors)
	return ok
}

func validationFields(err error) []domain.FieldError { return err.(*domain.ValidationErrors).Items }

func applicationError(err, target error) bool {
	for err != nil {
		if err == target {
			return true
		}
		type unwrapper interface{ Unwrap() error }
		unwrapped, ok := err.(unwrapper)
		if !ok {
			return false
		}
		err = unwrapped.Unwrap()
	}
	return false
}
