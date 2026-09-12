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

func TestSettingsSaveUsesOptimisticRevisionAndPreservesOmittedPasswordForSameIdentity(t *testing.T) {
	store := &settingsStoreFake{}
	box, _ := NewAESGCMSecretBox(bytes.Repeat([]byte{0x31}, 32))
	var captured []SMTPSettings
	service := NewSettingsManagement(store, box, func(settings SMTPSettings) (Mailer, error) {
		captured = append(captured, settings)
		return &settingsMailerFake{}, nil
	}, nil)
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
	second.FromName = "Operations Mailer"
	second.DefaultLocale = "zh-CN"
	view, err := service.SaveEmailSettings(context.Background(), second)
	if err != nil {
		t.Fatal(err)
	}
	if view.Revision != 2 || !bytes.Equal(store.current.PasswordCiphertext, originalCiphertext) {
		t.Fatalf("preserved password or revision failed: view=%#v", view)
	}
	if len(captured) != 2 || captured[1].Password != password {
		t.Fatalf("same-identity save did not reuse the password: %#v", captured)
	}
}

func TestSettingsSMTPIdentityTrimsWhitespaceButPreservesCase(t *testing.T) {
	store := &settingsStoreFake{}
	box, _ := NewAESGCMSecretBox(bytes.Repeat([]byte{0x45}, 32))
	var captured []SMTPSettings
	service := NewSettingsManagement(store, box, func(settings SMTPSettings) (Mailer, error) {
		captured = append(captured, settings)
		return &settingsMailerFake{}, nil
	}, nil)
	password := "old-secret"
	first := validEmailSettingsInput(0)
	first.Host = " smtp.example.com "
	first.Username = " mailer "
	first.Password = &password
	if _, err := service.SaveEmailSettings(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	same := validEmailSettingsInput(1)
	same.Host = "smtp.example.com "
	same.Username = "mailer"
	if _, err := service.SaveEmailSettings(context.Background(), same); err != nil {
		t.Fatal(err)
	}
	if len(captured) != 2 || captured[1].Password != password {
		t.Fatalf("trimmed identity did not reuse the password: %#v", captured)
	}
	changedCase := validEmailSettingsInput(2)
	changedCase.Host = "SMTP.example.com"
	if _, err := service.SaveEmailSettings(context.Background(), changedCase); !errors.Is(err, ErrInvalidMailSettings) {
		t.Fatalf("case-changed host error = %v", err)
	}
	changedUserCase := validEmailSettingsInput(2)
	changedUserCase.Username = "MAILER"
	if _, err := service.SaveEmailSettings(context.Background(), changedUserCase); !errors.Is(err, ErrInvalidMailSettings) {
		t.Fatalf("case-changed username error = %v", err)
	}
	if len(captured) != 2 {
		t.Fatalf("case changes reached the mailer factory: %#v", captured)
	}
}

func TestSettingsRejectsPasswordReuseAfterSMTPIdentityChanges(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		mutate func(*EmailSettingsInput)
	}{
		{name: "host", mutate: func(input *EmailSettingsInput) { input.Host = "smtp-other.example.com" }},
		{name: "port", mutate: func(input *EmailSettingsInput) { input.Port = 2525 }},
		{name: "username", mutate: func(input *EmailSettingsInput) { input.Username = "other-mailer" }},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			store := &settingsStoreFake{}
			box, _ := NewAESGCMSecretBox(bytes.Repeat([]byte{0x42}, 32))
			var captured []SMTPSettings
			service := NewSettingsManagement(store, box, func(settings SMTPSettings) (Mailer, error) {
				captured = append(captured, settings)
				return &settingsMailerFake{}, nil
			}, nil)
			password := "old-secret"
			first := validEmailSettingsInput(0)
			first.Password = &password
			if _, err := service.SaveEmailSettings(context.Background(), first); err != nil {
				t.Fatal(err)
			}
			before := append([]byte(nil), store.current.PasswordCiphertext...)
			changed := validEmailSettingsInput(1)
			testCase.mutate(&changed)
			if _, err := service.SaveEmailSettings(context.Background(), changed); !errors.Is(err, ErrInvalidMailSettings) {
				t.Fatalf("changed-identity save error = %v", err)
			}
			if store.saveCalls != 1 || !bytes.Equal(store.current.PasswordCiphertext, before) {
				t.Fatalf("rejected save changed state: calls=%d record=%#v", store.saveCalls, store.current)
			}
			if err := service.TestEmailSettings(context.Background(), changed, "admin@example.com"); !errors.Is(err, ErrInvalidMailSettings) {
				t.Fatalf("changed-identity test error = %v", err)
			}
			if len(captured) != 1 || captured[0].Password != password {
				t.Fatalf("rejected test handed a credential to the new connection: %#v", captured)
			}

			newPassword := "new-secret"
			changed.Password = &newPassword
			if _, err := service.SaveEmailSettings(context.Background(), changed); err != nil {
				t.Fatalf("explicit replacement save error = %v", err)
			}
			if len(captured) != 2 || captured[1].Password != newPassword || captured[1].Host != changed.Host || captured[1].Username != changed.Username {
				t.Fatalf("replacement save settings = %#v", captured)
			}
		})
	}
}

func TestSettingsIdentityChangeCanExplicitlyClearPasswordForUnauthenticatedSMTP(t *testing.T) {
	store := &settingsStoreFake{}
	box, _ := NewAESGCMSecretBox(bytes.Repeat([]byte{0x43}, 32))
	var captured []SMTPSettings
	service := NewSettingsManagement(store, box, func(settings SMTPSettings) (Mailer, error) {
		captured = append(captured, settings)
		return &settingsMailerFake{}, nil
	}, nil)
	password := "old-secret"
	first := validEmailSettingsInput(0)
	first.Password = &password
	if _, err := service.SaveEmailSettings(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	cleared := validEmailSettingsInput(1)
	cleared.Host = "mailpit"
	cleared.Port = 1025
	cleared.Username = ""
	cleared.ClearPassword = true
	if _, err := service.SaveEmailSettings(context.Background(), cleared); err != nil {
		t.Fatalf("clear save error = %v", err)
	}
	if len(captured) != 2 || captured[1].Password != "" || captured[1].Username != "" || store.current.PasswordCiphertext != nil {
		t.Fatalf("clear save retained credentials: captured=%#v record=%#v", captured, store.current)
	}
	if err := service.TestEmailSettings(context.Background(), cleared, "admin@example.com"); err != nil {
		t.Fatalf("clear test error = %v", err)
	}
	if len(captured) != 3 || captured[2].Password != "" || captured[2].Username != "" {
		t.Fatalf("clear test used credentials: %#v", captured)
	}
}

func TestSettingsTestRejectsStaleRevisionBeforeDecryptingSavedPassword(t *testing.T) {
	store := &settingsStoreFake{}
	box, _ := NewAESGCMSecretBox(bytes.Repeat([]byte{0x44}, 32))
	var captured []SMTPSettings
	service := NewSettingsManagement(store, box, func(settings SMTPSettings) (Mailer, error) {
		captured = append(captured, settings)
		return &settingsMailerFake{}, nil
	}, nil)
	password := "old-secret"
	first := validEmailSettingsInput(0)
	first.Password = &password
	if _, err := service.SaveEmailSettings(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	stale := validEmailSettingsInput(0)
	if err := service.TestEmailSettings(context.Background(), stale, "admin@example.com"); !errors.Is(err, ErrStaleRevision) {
		t.Fatalf("stale test error = %v", err)
	}
	if len(captured) != 1 {
		t.Fatalf("stale test created a new mailer: %#v", captured)
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

func TestSettingsTestSendsWithReplacementAndSameIdentityPassword(t *testing.T) {
	store := &settingsStoreFake{}
	box, _ := NewAESGCMSecretBox(bytes.Repeat([]byte{0x46}, 32))
	var captured []SMTPSettings
	var mailers []*settingsMailerFake
	service := NewSettingsManagement(store, box, func(settings SMTPSettings) (Mailer, error) {
		captured = append(captured, settings)
		mailer := &settingsMailerFake{}
		mailers = append(mailers, mailer)
		return mailer, nil
	}, nil)
	oldPassword := "old-secret"
	first := validEmailSettingsInput(0)
	first.Password = &oldPassword
	if _, err := service.SaveEmailSettings(context.Background(), first); err != nil {
		t.Fatal(err)
	}

	// An unchanged connection may test the current draft without sending the
	// encrypted password back through the form.
	sameIdentity := validEmailSettingsInput(1)
	if err := service.TestEmailSettings(context.Background(), sameIdentity, "same@example.com"); err != nil {
		t.Fatalf("same-identity test error = %v", err)
	}
	if len(captured) != 2 || captured[1].Password != oldPassword || len(mailers[1].messages) != 1 || mailers[1].messages[0].To != "same@example.com" {
		t.Fatalf("same-identity test settings/messages = %#v / %#v", captured, mailers)
	}

	// A changed connection must use the explicitly supplied replacement and
	// the test must remain a send-only operation.
	replacement := "replacement-secret"
	changed := validEmailSettingsInput(1)
	changed.Host = "smtp-new.example.com"
	changed.Password = &replacement
	if err := service.TestEmailSettings(context.Background(), changed, "replacement@example.com"); err != nil {
		t.Fatalf("replacement test error = %v", err)
	}
	if store.saveCalls != 1 || len(captured) != 3 || captured[2].Password != replacement || captured[2].Host != changed.Host || len(mailers[2].messages) != 1 || mailers[2].messages[0].To != "replacement@example.com" {
		t.Fatalf("replacement test side effects = saves:%d settings:%#v mailers:%#v", store.saveCalls, captured, mailers)
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

func TestSettingsTestUsesOneIdentityWithoutChangingSMTPFromName(t *testing.T) {
	mailer := &settingsMailerFake{}
	var captured SMTPSettings
	identity := &dispatcherIdentityFake{identity: SystemIdentityView{
		SystemName: `品牌 <主站> & Co`,
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
	if len(mailer.messages) != 1 || mailer.messages[0].SystemName != identity.identity.SystemName || mailer.messages[0].To != "recipient@example.com" || !strings.Contains(mailer.messages[0].Subject, identity.identity.SystemName) || !strings.Contains(mailer.messages[0].HTML, `品牌 &lt;主站&gt; &amp; Co`) {
		t.Fatalf("English test mail identity = %#v", mailer.messages)
	}

	input.DefaultLocale = "zh-CN"
	if err := service.TestEmailSettings(context.Background(), input, "recipient@example.com"); err != nil {
		t.Fatal(err)
	}
	if len(mailer.messages) != 2 || mailer.messages[1].SystemName != identity.identity.SystemName || !strings.Contains(mailer.messages[1].Subject, identity.identity.SystemName) || !strings.Contains(mailer.messages[1].HTML, `品牌 &lt;主站&gt; &amp; Co`) {
		t.Fatalf("Chinese test mail identity = %#v", mailer.messages)
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
