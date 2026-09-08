package application

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"example.com/temvia/api/internal/auth/domain"
)

type settingsStoreFake struct {
	current   *EmailSettingsRecord
	saveCalls int
}

func (s *settingsStoreFake) GetEmailSettings(context.Context) (EmailSettingsRecord, error) {
	if s.current == nil {
		return EmailSettingsRecord{}, ErrMailNotConfigured
	}
	copy := *s.current
	copy.PasswordCiphertext = append([]byte(nil), s.current.PasswordCiphertext...)
	return copy, nil
}

func (s *settingsStoreFake) SaveEmailSettings(_ context.Context, expected int64, record EmailSettingsRecord) (EmailSettingsRecord, error) {
	s.saveCalls++
	if s.current == nil {
		if expected != 0 {
			return EmailSettingsRecord{}, ErrStaleRevision
		}
		record.Revision = 1
	} else {
		if expected != s.current.Revision {
			return EmailSettingsRecord{}, ErrStaleRevision
		}
		record.Revision = s.current.Revision + 1
	}
	if record.UpdatedAt.IsZero() {
		record.UpdatedAt = time.Unix(record.Revision, 0).UTC()
	}
	copy := record
	copy.PasswordCiphertext = append([]byte(nil), record.PasswordCiphertext...)
	s.current = &copy
	return copy, nil
}

type settingsMailerFake struct {
	messages []OutgoingMail
}

func (m *settingsMailerFake) Send(_ context.Context, message OutgoingMail) error {
	m.messages = append(m.messages, message)
	return nil
}

type namedSettingsMailer struct{ host string }

func (m *namedSettingsMailer) Send(context.Context, OutgoingMail) error { return nil }

func validEmailSettingsInput(revision int64) EmailSettingsInput {
	return EmailSettingsInput{
		Host: "smtp.example.com", Port: 587, Security: "starttls", Username: "mailer",
		FromAddress: "no-reply@example.com", FromName: "Temvia", DefaultLocale: "en", Revision: revision,
	}
}

func TestSettingsSaveEncryptsPasswordAndReloadsRuntime(t *testing.T) {
	store := &settingsStoreFake{}
	box, err := NewAESGCMSecretBox(bytes.Repeat([]byte{0x2a}, 32))
	if err != nil {
		t.Fatal(err)
	}
	mailer := &settingsMailerFake{}
	factory := func(SMTPSettings) (Mailer, error) { return mailer, nil }
	runtime := NewReloadableMailer()
	service := NewSettingsManagement(store, box, factory, runtime)
	password := "secret-password"
	input := validEmailSettingsInput(0)
	input.Password = &password
	view, err := service.SaveEmailSettings(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	if !view.Configured || !view.PasswordSet || view.Revision != 1 {
		t.Fatalf("saved view = %#v", view)
	}
	if store.current == nil || len(store.current.PasswordCiphertext) == 0 || string(store.current.PasswordCiphertext) == password {
		t.Fatalf("password was not encrypted: %#v", store.current)
	}
	if err := runtime.Send(context.Background(), OutgoingMail{To: "admin@example.com"}); err != nil {
		t.Fatal(err)
	}
	if len(mailer.messages) != 1 {
		t.Fatalf("runtime messages = %d, want 1", len(mailer.messages))
	}
	loaded, err := service.GetEmailSettings(context.Background())
	if err != nil || !loaded.Configured || !loaded.PasswordSet {
		// PasswordSet is deliberately true while the password itself is never returned.
		t.Fatalf("loaded view = %#v, err=%v", loaded, err)
	}
}

func TestSettingsSaveUsesOptimisticRevisionAndPreservesOmittedPassword(t *testing.T) {
	store := &settingsStoreFake{}
	box, _ := NewAESGCMSecretBox(bytes.Repeat([]byte{0x31}, 32))
	service := NewSettingsManagement(store, box, func(SMTPSettings) (Mailer, error) { return &settingsMailerFake{}, nil }, nil)
	password := "secret-password"
	first := validEmailSettingsInput(0)
	first.Password = &password
	if _, err := service.SaveEmailSettings(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	originalCiphertext := append([]byte(nil), store.current.PasswordCiphertext...)
	stale := validEmailSettingsInput(0)
	if _, err := service.SaveEmailSettings(context.Background(), stale); !errors.Is(err, ErrStaleRevision) {
		t.Fatalf("stale save error = %v", err)
	}
	if store.saveCalls != 1 {
		t.Fatalf("stale save reached store = %d calls", store.saveCalls)
	}
	second := validEmailSettingsInput(1)
	second.Host = "smtp-2.example.com"
	view, err := service.SaveEmailSettings(context.Background(), second)
	if err != nil {
		t.Fatal(err)
	}
	if view.Revision != 2 || !bytes.Equal(store.current.PasswordCiphertext, originalCiphertext) {
		t.Fatalf("preserved password or revision failed: view=%#v", view)
	}
}

func TestSettingsRejectsIncompleteEffectiveCredentials(t *testing.T) {
	store := &settingsStoreFake{}
	box, _ := NewAESGCMSecretBox(bytes.Repeat([]byte{0x41}, 32))
	service := NewSettingsManagement(store, box, func(SMTPSettings) (Mailer, error) { return &settingsMailerFake{}, nil }, nil)
	password := "secret-password"
	first := validEmailSettingsInput(0)
	first.Password = &password
	if _, err := service.SaveEmailSettings(context.Background(), first); err != nil {
		t.Fatal(err)
	}

	withoutUsername := validEmailSettingsInput(1)
	withoutUsername.Username = ""
	if _, err := service.SaveEmailSettings(context.Background(), withoutUsername); !errors.Is(err, ErrInvalidMailSettings) {
		t.Fatalf("save with retained password and no username = %v", err)
	}

	clearWithUsername := validEmailSettingsInput(1)
	clearWithUsername.ClearPassword = true
	if _, err := service.SaveEmailSettings(context.Background(), clearWithUsername); !errors.Is(err, ErrInvalidMailSettings) {
		t.Fatalf("save with username and cleared password = %v", err)
	}
	if err := service.TestEmailSettings(context.Background(), clearWithUsername, "admin@example.com"); !errors.Is(err, ErrInvalidMailSettings) {
		t.Fatalf("test with username and cleared password = %v", err)
	}
}

func TestSettingsSerializesRuntimeReloadAfterConcurrentSaves(t *testing.T) {
	store := &settingsStoreFake{}
	firstFactoryStarted := make(chan struct{})
	releaseFirstFactory := make(chan struct{})
	factory := func(settings SMTPSettings) (Mailer, error) {
		if settings.Host == "smtp-a.example.com" {
			close(firstFactoryStarted)
			<-releaseFirstFactory
		}
		return &namedSettingsMailer{host: settings.Host}, nil
	}
	runtime := NewReloadableMailer()
	service := NewSettingsManagement(store, nil, factory, runtime)

	first := validEmailSettingsInput(0)
	first.Username = ""
	first.Host = "smtp-a.example.com"
	firstDone := make(chan error, 1)
	go func() { _, err := service.SaveEmailSettings(context.Background(), first); firstDone <- err }()
	<-firstFactoryStarted

	second := validEmailSettingsInput(0)
	second.Username = ""
	second.Host = "smtp-b.example.com"
	second.Revision = 1
	secondDone := make(chan error, 1)
	go func() { _, err := service.SaveEmailSettings(context.Background(), second); secondDone <- err }()
	select {
	case err := <-secondDone:
		t.Fatalf("second save completed while first was reloading: %v", err)
	case <-time.After(20 * time.Millisecond):
	}
	close(releaseFirstFactory)
	if err := <-firstDone; err != nil {
		t.Fatal(err)
	}
	if err := <-secondDone; err != nil {
		t.Fatal(err)
	}

	runtime.mu.RLock()
	active := runtime.mailer
	runtime.mu.RUnlock()
	if active == nil {
		t.Fatal("runtime mailer was not loaded")
	}
	if named, ok := active.(*namedSettingsMailer); !ok || named.host != "smtp-b.example.com" {
		t.Fatalf("runtime mailer = %#v", active)
	}
	if store.current == nil || store.current.Host != "smtp-b.example.com" || store.current.Revision != 2 {
		t.Fatalf("final settings = %#v", store.current)
	}
}

func TestSettingsTestUsesUnsavedSnapshotWithoutPersistence(t *testing.T) {
	store := &settingsStoreFake{}
	mailer := &settingsMailerFake{}
	service := NewSettingsManagement(store, nil, func(settings SMTPSettings) (Mailer, error) {
		if settings.Host != "mailpit" || settings.Port != 1025 || settings.Security != "none" {
			return nil, errors.New("unexpected SMTP snapshot")
		}
		return mailer, nil
	}, nil)
	input := EmailSettingsInput{Host: "mailpit", Port: 1025, Security: "none", FromAddress: "no-reply@example.com", FromName: "Temvia", DefaultLocale: "zh-CN"}
	if err := service.TestEmailSettings(context.Background(), input, "real@example.com"); err != nil {
		t.Fatal(err)
	}
	if store.saveCalls != 0 || len(mailer.messages) != 1 || mailer.messages[0].To != "real@example.com" || mailer.messages[0].Locale != domain.LocaleChinese || !strings.Contains(mailer.messages[0].Text, "测试") {
		t.Fatalf("test mail side effects = saves:%d messages:%#v", store.saveCalls, mailer.messages)
	}
}

func TestSettingsTestUsesLocalizedIdentityWithoutChangingSMTPFromName(t *testing.T) {
	mailer := &settingsMailerFake{}
	var captured SMTPSettings
	identity := &dispatcherIdentityFake{identity: SystemIdentityView{
		SystemName:        `品牌 <主站> & Co`,
		EnglishSystemName: `Brand <Admin> & Co`,
	}}
	service := NewSettingsManagement(nil, nil, func(settings SMTPSettings) (Mailer, error) {
		captured = settings
		return mailer, nil
	}, nil)
	service.SetSystemIdentityProvider(identity)

	input := EmailSettingsInput{Host: "mailpit", Port: 1025, Security: "none", FromAddress: "no-reply@example.com", FromName: "Operations Mailer", DefaultLocale: "en"}
	if err := service.TestEmailSettings(context.Background(), input, "recipient@example.com"); err != nil {
		t.Fatal(err)
	}
	if captured.FromAddress != input.FromAddress || captured.FromName != input.FromName {
		t.Fatalf("SMTP sender settings changed by identity: %#v", captured)
	}
	if len(mailer.messages) != 1 || mailer.messages[0].SystemName != identity.identity.EnglishSystemName || mailer.messages[0].To != "recipient@example.com" || !strings.Contains(mailer.messages[0].Subject, identity.identity.EnglishSystemName) || !strings.Contains(mailer.messages[0].HTML, `Brand &lt;Admin&gt; &amp; Co`) {
		t.Fatalf("English test mail identity = %#v", mailer.messages)
	}

	input.DefaultLocale = "zh-CN"
	if err := service.TestEmailSettings(context.Background(), input, "recipient@example.com"); err != nil {
		t.Fatal(err)
	}
	if len(mailer.messages) != 2 || mailer.messages[1].SystemName != identity.identity.SystemName || !strings.Contains(mailer.messages[1].Subject, identity.identity.SystemName) || !strings.Contains(mailer.messages[1].HTML, `品牌 &lt;主站&gt; &amp; Co`) {
		t.Fatalf("Chinese test mail identity = %#v", mailer.messages)
	}

	identity.identity.EnglishSystemName = ""
	input.DefaultLocale = "en"
	if err := service.TestEmailSettings(context.Background(), input, "recipient@example.com"); err != nil {
		t.Fatal(err)
	}
	if len(mailer.messages) != 3 || mailer.messages[2].SystemName != identity.identity.SystemName || !strings.Contains(mailer.messages[2].Subject, identity.identity.SystemName) {
		t.Fatalf("English fallback test mail identity = %#v", mailer.messages)
	}
}

func TestSettingsTestValidatesAndNormalizesRecipient(t *testing.T) {
	mailer := &settingsMailerFake{}
	service := NewSettingsManagement(nil, nil, func(SMTPSettings) (Mailer, error) { return mailer, nil }, nil)
	input := EmailSettingsInput{Host: "mailpit", Port: 1025, Security: "none", FromAddress: "no-reply@example.com", FromName: "Temvia", DefaultLocale: "en"}
	if err := service.TestEmailSettings(context.Background(), input, "not-an-email"); err == nil {
		t.Fatal("invalid recipient accepted")
	}
	if err := service.TestEmailSettings(context.Background(), input, "real@example.com\r\n"); err != nil {
		t.Fatal(err)
	}
	if len(mailer.messages) != 1 || mailer.messages[0].To != "real@example.com" {
		t.Fatalf("normalized recipient = %#v", mailer.messages)
	}
}

func TestSettingsValidationRequiresLocaleAndProductionTLS(t *testing.T) {
	store := &settingsStoreFake{}
	service := NewSettingsManagement(store, nil, func(SMTPSettings) (Mailer, error) { return &settingsMailerFake{}, nil }, nil)
	input := validEmailSettingsInput(0)
	input.DefaultLocale = ""
	if _, err := service.SaveEmailSettings(context.Background(), input); err == nil {
		t.Fatal("first save without locale accepted")
	}
	service.SetProductionMode(true)
	input = validEmailSettingsInput(0)
	input.Security = "none"
	if _, err := service.SaveEmailSettings(context.Background(), input); !errors.Is(err, ErrInvalidMailSettings) {
		t.Fatalf("production cleartext save error = %v", err)
	}
}
