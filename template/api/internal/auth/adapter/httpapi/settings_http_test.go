package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"example.com/temvia/api/internal/auth/application"
	"example.com/temvia/api/internal/auth/domain"
)

type settingsHTTPAuth struct {
	principal domain.Principal
}

func (a *settingsHTTPAuth) Login(context.Context, application.LoginInput) (domain.User, string, error) {
	return a.principal.User, "", nil
}

func (a *settingsHTTPAuth) Current(context.Context, string) (domain.User, error) {
	return a.principal.User, nil
}

func (*settingsHTTPAuth) Logout(context.Context, string) error { return nil }

func (a *settingsHTTPAuth) LoginWithPrincipal(context.Context, application.LoginInput) (domain.Principal, string, error) {
	return a.principal, "", nil
}

func (a *settingsHTTPAuth) CurrentPrincipal(context.Context, string) (domain.Principal, error) {
	return a.principal, nil
}

type settingsHTTPFake struct {
	recipient string
	calls     int
}

func (*settingsHTTPFake) GetEmailSettings(context.Context) (application.EmailSettingsView, error) {
	return application.EmailSettingsView{}, nil
}

func (*settingsHTTPFake) SaveEmailSettings(context.Context, application.EmailSettingsInput) (application.EmailSettingsView, error) {
	return application.EmailSettingsView{}, nil
}

func (f *settingsHTTPFake) TestEmailSettings(_ context.Context, _ application.EmailSettingsInput, recipient string) error {
	f.calls++
	f.recipient = recipient
	return nil
}

func (*settingsHTTPFake) OperationalWarnings(context.Context) ([]application.OperationalWarning, error) {
	return nil, nil
}

func TestEmailSettingsTestForwardsRecipient(t *testing.T) {
	settings := &settingsHTTPFake{}
	auth := &settingsHTTPAuth{principal: domain.Principal{User: domain.User{ID: "admin", Email: "admin@example.com"}, SuperAdmin: true}}
	handler := NewHandlerWithAccess(&setupFake{status: application.SetupComplete}, auth, testConfig(), nil, nil, nil, settings)
	req := httptest.NewRequest(http.MethodPost, "/api/settings/email/test", strings.NewReader(`{"host":"mailpit","port":1025,"security":"none","username":"","fromAddress":"no-reply@example.com","fromName":"Temvia","defaultLocale":"en","revision":0,"recipient":"real@example.com"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", testConfig().Origin)
	req.AddCookie(&http.Cookie{Name: testConfig().CookieName, Value: "session"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)

	if response.Code != http.StatusAccepted || settings.calls != 1 || settings.recipient != "real@example.com" {
		t.Fatalf("response=%d calls=%d recipient=%q body=%s", response.Code, settings.calls, settings.recipient, response.Body.String())
	}
}
