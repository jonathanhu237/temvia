package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"
	"unicode/utf8"
)

const maxJSONBody = 64 * 1024

var (
	errInvalidJSON      = errors.New("invalid JSON document")
	errUnsupportedMedia = errors.New("unsupported media type")
	errBodyTooLarge     = errors.New("request body too large")
)

type fieldValueError struct{ field string }

func (e fieldValueError) Error() string { return "invalid value for " + e.field }

func decodeJSONObject(r *http.Request, target any, allowed map[string]struct{}) error {
	if r.ContentLength > maxJSONBody {
		return errBodyTooLarge
	}
	contentTypes := r.Header.Values("Content-Type")
	if len(contentTypes) != 1 {
		return errUnsupportedMedia
	}
	if err := requireJSONContentType(contentTypes[0]); err != nil {
		return err
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxJSONBody+1))
	if err != nil {
		return errInvalidJSON
	}
	if len(body) > maxJSONBody {
		return errBodyTooLarge
	}
	if len(bytes.TrimSpace(body)) == 0 || !utf8.Valid(body) {
		return errInvalidJSON
	}
	fields, err := parseJSONObject(body)
	if err != nil {
		return errInvalidJSON
	}
	for key := range fields {
		if _, ok := allowed[key]; !ok {
			return errInvalidJSON
		}
	}
	encoded, err := json.Marshal(fields)
	if err != nil {
		return errInvalidJSON
	}
	if err := json.Unmarshal(encoded, target); err != nil {
		var typeError *json.UnmarshalTypeError
		if errors.As(err, &typeError) && typeError.Field != "" {
			return fieldValueError{field: typeError.Field}
		}
		return errInvalidJSON
	}
	return nil
}

func requireJSONContentType(value string) error {
	mediaType, params, err := mime.ParseMediaType(value)
	if err != nil || mediaType != "application/json" {
		return errUnsupportedMedia
	}
	if charset := params["charset"]; charset != "" && !strings.EqualFold(charset, "utf-8") {
		return errUnsupportedMedia
	}
	for name := range params {
		if !strings.EqualFold(name, "charset") {
			return errUnsupportedMedia
		}
	}
	return nil
}

func parseJSONObject(body []byte) (map[string]json.RawMessage, error) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	first, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	delim, ok := first.(json.Delim)
	if !ok || delim != '{' {
		return nil, errInvalidJSON
	}
	fields := make(map[string]json.RawMessage)
	for decoder.More() {
		keyToken, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		key, ok := keyToken.(string)
		if !ok {
			return nil, errInvalidJSON
		}
		if _, exists := fields[key]; exists {
			return nil, errInvalidJSON
		}
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return nil, err
		}
		fields[key] = value
	}
	last, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	if delim, ok := last.(json.Delim); !ok || delim != '}' {
		return nil, errInvalidJSON
	}
	var extra json.RawMessage
	if err := decoder.Decode(&extra); err != io.EOF {
		return nil, errInvalidJSON
	}
	return fields, nil
}
