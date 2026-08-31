package domain

import (
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

// FieldError is a stable, transport-independent validation error.
type FieldError struct {
	Field  string
	Code   string
	Params map[string]any
}

// ValidationErrors groups field errors without coupling the domain to HTTP.
type ValidationErrors struct {
	Items []FieldError
}

func (e *ValidationErrors) Error() string {
	if len(e.Items) == 0 {
		return "validation failed"
	}
	return fmt.Sprintf("validation failed for %d field(s)", len(e.Items))
}

func (e *ValidationErrors) add(field, code string) {
	e.Items = append(e.Items, FieldError{Field: field, Code: code})
}

type Name string

func NewName(value string) (Name, error) {
	if !utf8.ValidString(value) {
		return "", &ValidationErrors{Items: []FieldError{{Field: "name", Code: "invalid_name"}}}
	}
	for _, r := range value {
		if unicode.IsControl(r) || r == '\u2028' || r == '\u2029' {
			return "", &ValidationErrors{Items: []FieldError{{Field: "name", Code: "invalid_name"}}}
		}
	}
	value = norm.NFC.String(strings.TrimFunc(value, unicode.IsSpace))
	if !utf8.ValidString(value) || utf8.RuneCountInString(value) < 1 || utf8.RuneCountInString(value) > 100 {
		return "", &ValidationErrors{Items: []FieldError{{Field: "name", Code: "invalid_name"}}}
	}
	return Name(value), nil
}

type Email struct {
	Display   string
	Canonical string
}

func NewEmail(value string) (Email, error) {
	value = strings.TrimFunc(value, unicode.IsSpace)
	validation := &ValidationErrors{}
	if !utf8.ValidString(value) || len(value) == 0 || len(value) > 254 {
		validation.add("email", "invalid_email")
		return Email{}, validation
	}
	for _, r := range value {
		if r > 127 {
			validation.add("email", "invalid_email")
			return Email{}, validation
		}
	}
	at := strings.IndexByte(value, '@')
	if at <= 0 || at != strings.LastIndexByte(value, '@') || at > 64 || at == len(value)-1 {
		validation.add("email", "invalid_email")
		return Email{}, validation
	}
	local, host := value[:at], value[at+1:]
	if local[0] == '.' || local[len(local)-1] == '.' || strings.Contains(local, "..") {
		validation.add("email", "invalid_email")
		return Email{}, validation
	}
	for _, r := range local {
		if r == '.' || isEmailAtom(r) {
			continue
		}
		validation.add("email", "invalid_email")
		return Email{}, validation
	}
	labels := strings.Split(host, ".")
	for _, label := range labels {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			validation.add("email", "invalid_email")
			return Email{}, validation
		}
		for _, r := range label {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' {
				continue
			}
			validation.add("email", "invalid_email")
			return Email{}, validation
		}
	}
	return Email{Display: value, Canonical: strings.ToLower(value)}, nil
}

func isEmailAtom(r rune) bool {
	if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
		return true
	}
	return strings.ContainsRune("!#$%&'*+-/=?^_`{|}~", r)
}

type Password string

func NewPassword(value string) (Password, error) {
	return newPassword(value, "invalid_password", true)
}

// NewLoginPassword validates only the input boundary needed before password
// verification. It deliberately does not apply the creation policy so that a
// password accepted by an earlier policy remains usable after an upgrade.
func NewLoginPassword(value string) (Password, error) {
	return newPassword(value, "invalid_login_password", false)
}

func newPassword(value, code string, requireComposition bool) (Password, error) {
	if !utf8.ValidString(value) {
		return "", passwordValidationError(code)
	}
	value = norm.NFC.String(value)
	runes := utf8.RuneCountInString(value)
	if runes == 0 || runes > 128 || (requireComposition && runes < 8) {
		return "", passwordValidationError(code)
	}
	if requireComposition {
		var upper, lower, digit, special bool
		for _, r := range value {
			switch {
			case r >= 'A' && r <= 'Z':
				upper = true
			case r >= 'a' && r <= 'z':
				lower = true
			case r >= '0' && r <= '9':
				digit = true
			case isPasswordSpecial(r):
				special = true
			}
		}
		if !upper || !lower || !digit || !special {
			return "", passwordValidationError(code)
		}
	}
	return Password(value), nil
}

func passwordValidationError(code string) error {
	return &ValidationErrors{Items: []FieldError{{Field: "password", Code: code}}}
}

func isPasswordSpecial(r rune) bool {
	return (r >= 0x21 && r <= 0x2f) ||
		(r >= 0x3a && r <= 0x40) ||
		(r >= 0x5b && r <= 0x60) ||
		(r >= 0x7b && r <= 0x7e)
}
