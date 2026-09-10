package application

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"html"
	"net/mail"
	"strconv"
	"strings"
	"sync"
	"time"

	"example.com/temvia/api/internal/auth/domain"
)

// EmailSettingsRecord is the encrypted persistence projection. PasswordCiphertext
// must never be copied into an HTTP response or a browser draft.
type EmailSettingsRecord struct {
	Host               string
	Port               int
	Security           string
	Username           string
	PasswordCiphertext []byte
	FromAddress        string
	FromName           string
	DefaultLocale      domain.Locale
	Revision           int64
	UpdatedAt          time.Time
}

type EmailSettingsStore interface {
	GetEmailSettings(context.Context) (EmailSettingsRecord, error)
	SaveEmailSettings(context.Context, int64, EmailSettingsRecord) (EmailSettingsRecord, error)
}

type EmailSettingsView struct {
	Configured    bool
	Host          string
	Port          int
	Security      string
	Username      string
	PasswordSet   bool
	FromAddress   string
	FromName      string
	DefaultLocale domain.Locale
	Revision      int64
	UpdatedAt     time.Time
}

type EmailSettingsInput struct {
	Host          string
	Port          int
	Security      string
	Username      string
	Password      *string
	ClearPassword bool
	FromAddress   string
	FromName      string
	DefaultLocale string
	Revision      int64
}

type SMTPSettings struct {
	Host        string
	Port        int
	Security    string
	Username    string
	Password    string
	FromAddress string
	FromName    string
}

type MailerFactory func(SMTPSettings) (Mailer, error)

// SettingsManagement owns the cross-device system settings lifecycle. The
// service stores only authenticated/encrypted SMTP credentials and updates a
// runtime mailer atomically after an optimistic-lock success.
type SettingsManagement struct {
	store       EmailSettingsStore
	cipher      SecretBox
	factory     MailerFactory
	runtime     *ReloadableMailer
	identity    SystemIdentityProvider
	production  bool
	mailLimiter TestEmailLimiter
	// saveMu serializes the commit and runtime reload pair. Without one
	// critical section, two successful saves could reload their mailers in the
	// opposite order and leave the runtime using an older committed revision.
	saveMu sync.Mutex
}

func NewSettingsManagement(store EmailSettingsStore, cipher SecretBox, factory MailerFactory, runtime *ReloadableMailer) *SettingsManagement {
	return &SettingsManagement{store: store, cipher: cipher, factory: factory, runtime: runtime}
}

func (s *SettingsManagement) SetProductionMode(production bool) {
	if s != nil {
		s.production = production
	}
}

func (s *SettingsManagement) SetTestEmailLimiter(limiter TestEmailLimiter) {
	if s != nil {
		s.mailLimiter = limiter
	}
}

func (s *SettingsManagement) SetSystemIdentityProvider(identity SystemIdentityProvider) {
	if s != nil {
		s.identity = identity
	}
}

func (s *SettingsManagement) GetEmailSettings(ctx context.Context) (EmailSettingsView, error) {
	if s == nil || s.store == nil {
		return EmailSettingsView{}, ErrDependencyUnavailable
	}
	record, err := s.store.GetEmailSettings(ctx)
	if errors.Is(err, ErrMailNotConfigured) {
		return EmailSettingsView{}, nil
	}
	if err != nil {
		return EmailSettingsView{}, dependencyError(err)
	}
	return emailSettingsView(record), nil
}

func (s *SettingsManagement) SaveEmailSettings(ctx context.Context, input EmailSettingsInput) (EmailSettingsView, error) {
	if s == nil || s.store == nil {
		return EmailSettingsView{}, ErrDependencyUnavailable
	}
	s.saveMu.Lock()
	defer s.saveMu.Unlock()
	if input.Password != nil && *input.Password == "" && !input.ClearPassword {
		input.Password = nil
	}
	if err := validateEmailSettingsInput(input, s.production); err != nil {
		return EmailSettingsView{}, err
	}
	current, currentErr := s.store.GetEmailSettings(ctx)
	hasCurrent := currentErr == nil
	if currentErr != nil && !errors.Is(currentErr, ErrMailNotConfigured) {
		return EmailSettingsView{}, dependencyError(currentErr)
	}
	if input.Revision < 0 || (hasCurrent && input.Revision != current.Revision) || (!hasCurrent && input.Revision != 0) {
		return EmailSettingsView{}, ErrStaleRevision
	}
	record := EmailSettingsRecord{
		Host:          strings.TrimSpace(input.Host),
		Port:          input.Port,
		Security:      strings.ToLower(strings.TrimSpace(input.Security)),
		Username:      strings.TrimSpace(input.Username),
		FromAddress:   strings.TrimSpace(input.FromAddress),
		FromName:      strings.TrimSpace(input.FromName),
		DefaultLocale: domain.Locale(input.DefaultLocale),
		Revision:      input.Revision,
	}
	if input.ClearPassword {
		if input.Password != nil {
			return EmailSettingsView{}, ErrInvalidMailSettings
		}
		record.PasswordCiphertext = nil
	} else if input.Password != nil {
		if s.cipher == nil {
			return EmailSettingsView{}, ErrDependencyUnavailable
		}
		ciphertext, err := s.cipher.Encrypt([]byte(*input.Password))
		if err != nil {
			return EmailSettingsView{}, dependencyError(err)
		}
		record.PasswordCiphertext = ciphertext
	} else if hasCurrent {
		record.PasswordCiphertext = append([]byte(nil), current.PasswordCiphertext...)
	}
	if !validSMTPCredentials(record.Username, len(record.PasswordCiphertext) > 0) {
		return EmailSettingsView{}, ErrInvalidMailSettings
	}
	// Build and validate the SMTP client before committing the row. A bad
	// connection setting must not leave a saved configuration that the runtime
	// cannot activate.
	mailer, err := s.mailerForRecord(record)
	if err != nil {
		return EmailSettingsView{}, err
	}
	record, err = s.store.SaveEmailSettings(ctx, input.Revision, record)
	if err != nil {
		if errors.Is(err, ErrStaleRevision) {
			return EmailSettingsView{}, ErrStaleRevision
		}
		return EmailSettingsView{}, dependencyError(err)
	}
	if s.runtime != nil && mailer != nil {
		s.runtime.Reload(mailer)
	}
	return emailSettingsView(record), nil
}

func (s *SettingsManagement) DefaultMailLocale(ctx context.Context) (domain.Locale, error) {
	view, err := s.GetEmailSettings(ctx)
	if err != nil {
		return "", err
	}
	if !view.Configured || !view.DefaultLocale.Valid() {
		return "", ErrMailNotConfigured
	}
	return view.DefaultLocale, nil
}

func (s *SettingsManagement) EnsureMailConfigured(ctx context.Context) error {
	view, err := s.GetEmailSettings(ctx)
	if err != nil {
		return err
	}
	if !view.Configured || !view.DefaultLocale.Valid() {
		return ErrMailNotConfigured
	}
	return nil
}

func (s *SettingsManagement) OperationalWarnings(ctx context.Context) ([]OperationalWarning, error) {
	view, err := s.GetEmailSettings(ctx)
	if err != nil {
		return nil, err
	}
	if !view.Configured {
		return []OperationalWarning{{Key: "email_not_configured", Severity: "warning"}}, nil
	}
	return nil, nil
}

// LoadRuntime applies a persisted configuration during process startup. An
// empty table is a supported first-run state and leaves the runtime mailer
// disabled until an administrator saves settings.
func (s *SettingsManagement) LoadRuntime(ctx context.Context) error {
	if s == nil || s.store == nil {
		return ErrDependencyUnavailable
	}
	record, err := s.store.GetEmailSettings(ctx)
	if errors.Is(err, ErrMailNotConfigured) {
		return nil
	}
	if err != nil {
		return dependencyError(err)
	}
	return s.applyRuntime(record)
}

// TestEmailSettings sends one message using the form snapshot. It deliberately
// bypasses persistence and therefore cannot alter the saved configuration.
func (s *SettingsManagement) TestEmailSettings(ctx context.Context, input EmailSettingsInput, recipient string) error {
	return s.testEmailSettings(ctx, "", input, recipient)
}

// TestEmailSettingsForActor applies the authenticated actor and recipient
// buckets before resolving SMTP credentials or sending. The legacy method is
// retained for embedders that do not have an actor identity at this seam.
func (s *SettingsManagement) TestEmailSettingsForActor(ctx context.Context, actorID string, input EmailSettingsInput, recipient string) error {
	return s.testEmailSettings(ctx, actorID, input, recipient)
}

func (s *SettingsManagement) testEmailSettings(ctx context.Context, actorID string, input EmailSettingsInput, recipient string) error {
	if s == nil || s.factory == nil {
		return ErrDependencyUnavailable
	}
	if err := validateEmailSettingsInput(input, s.production); err != nil {
		return err
	}
	recipient = strings.TrimSpace(recipient)
	parsedRecipient, err := mail.ParseAddress(recipient)
	if err != nil || parsedRecipient.Address != recipient || strings.ContainsAny(recipient, "\r\n") {
		return &domain.ValidationErrors{Items: []domain.FieldError{{Field: "recipient", Code: "invalid_email"}}}
	}
	canonicalRecipient, canonicalErr := domain.NewEmail(recipient)
	if canonicalErr != nil {
		return &domain.ValidationErrors{Items: []domain.FieldError{{Field: "recipient", Code: "invalid_email"}}}
	}
	if actorID != "" && s.mailLimiter != nil {
		allowed, limitErr := s.mailLimiter.AllowTestEmail(ctx, actorID, canonicalRecipient.Canonical)
		if limitErr != nil {
			return dependencyError(limitErr)
		}
		if !allowed {
			return ErrRateLimited
		}
	}
	password := ""
	if input.Password != nil {
		password = *input.Password
	}
	if input.Password == nil && !input.ClearPassword && strings.TrimSpace(input.Username) != "" {
		if s.store == nil {
			return ErrDependencyUnavailable
		}
		current, currentErr := s.store.GetEmailSettings(ctx)
		if errors.Is(currentErr, ErrMailNotConfigured) {
			return ErrMailNotConfigured
		}
		if currentErr != nil {
			return dependencyError(currentErr)
		}
		if input.Revision != current.Revision {
			return ErrStaleRevision
		}
		if len(current.PasswordCiphertext) > 0 {
			if s.cipher == nil {
				return ErrDependencyUnavailable
			}
			plain, decryptErr := s.cipher.Decrypt(current.PasswordCiphertext)
			if decryptErr != nil {
				return dependencyError(decryptErr)
			}
			password = string(plain)
		}
	}
	if !validSMTPCredentials(strings.TrimSpace(input.Username), password != "") {
		return ErrInvalidMailSettings
	}
	systemName := DefaultSystemName
	if s.identity != nil {
		identity, identityErr := s.identity.CurrentSystemIdentity(ctx)
		if identityErr != nil {
			return identityErr
		}
		systemName = identity.DisplayName()
	}
	mailer, err := s.factory(SMTPSettings{Host: strings.TrimSpace(input.Host), Port: input.Port, Security: strings.ToLower(strings.TrimSpace(input.Security)), Username: strings.TrimSpace(input.Username), Password: password, FromAddress: strings.TrimSpace(input.FromAddress), FromName: strings.TrimSpace(input.FromName)})
	if err != nil {
		return dependencyError(err)
	}
	locale := domain.Locale(input.DefaultLocale)
	message := OutgoingMail{MessageID: "temvia-settings-test-" + strconv.FormatInt(time.Now().UnixNano(), 10) + "@temvia", Kind: MailPasswordReset, SystemName: systemName, Name: "administrator", To: recipient, Locale: locale}
	if locale == domain.LocaleChinese {
		message.Subject = systemName + " 邮件服务测试"
		message.Text = "这是一封 " + systemName + " 邮件服务测试邮件。"
		message.HTML = "<p>这是一封 " + html.EscapeString(systemName) + " 邮件服务测试邮件。</p>"
	} else {
		message.Subject = systemName + " email service test"
		message.Text = "This is a test email from " + systemName + "."
		message.HTML = "<p>This is a test email from " + html.EscapeString(systemName) + ".</p>"
	}
	return mailer.Send(ctx, message)
}

type OperationalWarning struct {
	Key      string `json:"key"`
	Severity string `json:"severity"`
}

func (s *SettingsManagement) applyRuntime(record EmailSettingsRecord) error {
	if s.runtime == nil || s.factory == nil {
		return nil
	}
	mailer, err := s.mailerForRecord(record)
	if err != nil {
		return err
	}
	if mailer != nil {
		s.runtime.Reload(mailer)
	}
	return nil
}

func (s *SettingsManagement) mailerForRecord(record EmailSettingsRecord) (Mailer, error) {
	if s.factory == nil {
		return nil, nil
	}
	password := []byte(nil)
	if len(record.PasswordCiphertext) > 0 {
		if s.cipher == nil {
			return nil, ErrDependencyUnavailable
		}
		plain, err := s.cipher.Decrypt(record.PasswordCiphertext)
		if err != nil {
			return nil, dependencyError(err)
		}
		password = plain
	}
	mailer, err := s.factory(SMTPSettings{Host: record.Host, Port: record.Port, Security: record.Security, Username: record.Username, Password: string(password), FromAddress: record.FromAddress, FromName: record.FromName})
	if err != nil {
		return nil, dependencyError(err)
	}
	return mailer, nil
}

func emailSettingsView(record EmailSettingsRecord) EmailSettingsView {
	return EmailSettingsView{Configured: true, Host: record.Host, Port: record.Port, Security: record.Security, Username: record.Username, PasswordSet: len(record.PasswordCiphertext) > 0, FromAddress: record.FromAddress, FromName: record.FromName, DefaultLocale: record.DefaultLocale, Revision: record.Revision, UpdatedAt: record.UpdatedAt}
}

func validateEmailSettingsInput(input EmailSettingsInput, production bool) error {
	if strings.TrimSpace(input.Host) == "" || input.Port < 1 || input.Port > 65535 {
		return ErrInvalidMailSettings
	}
	security := strings.ToLower(strings.TrimSpace(input.Security))
	if security != "none" && security != "starttls" && security != "tls" {
		return ErrInvalidMailSettings
	}
	if production && security == "none" {
		return ErrInvalidMailSettings
	}
	if input.ClearPassword && input.Password != nil {
		return ErrInvalidMailSettings
	}
	if strings.TrimSpace(input.Username) == "" && input.Password != nil && *input.Password != "" {
		return ErrInvalidMailSettings
	}
	if strings.TrimSpace(input.Username) != "" && input.Password != nil && *input.Password == "" {
		return ErrInvalidMailSettings
	}
	if strings.TrimSpace(input.FromAddress) == "" || strings.ContainsAny(input.FromAddress, "\r\n") || strings.ContainsAny(input.FromName, "\r\n") || strings.TrimSpace(input.FromName) == "" {
		return ErrInvalidMailSettings
	}
	parsed, err := mail.ParseAddress(strings.TrimSpace(input.FromAddress))
	if err != nil || parsed.Address != strings.TrimSpace(input.FromAddress) {
		return ErrInvalidMailSettings
	}
	if !domain.Locale(input.DefaultLocale).Valid() {
		return &domain.ValidationErrors{Items: []domain.FieldError{{Field: "defaultLocale", Code: "invalid_locale"}}}
	}
	if len([]rune(input.Host)) > 255 || len([]rune(input.Username)) > 255 || len([]rune(input.FromName)) > 200 {
		return ErrInvalidMailSettings
	}
	return nil
}

// validSMTPCredentials keeps the authentication pair all-or-nothing after the
// requested preserve/replace/clear operation has been resolved. An encrypted
// password without a username would otherwise make the SMTP adapter enable
// authentication with an empty username.
func validSMTPCredentials(username string, passwordSet bool) bool {
	return (strings.TrimSpace(username) == "") == !passwordSet
}

// SecretBox is the encryption boundary for persisted settings.
type SecretBox interface {
	Encrypt([]byte) ([]byte, error)
	Decrypt([]byte) ([]byte, error)
}

type AESGCMSecretBox struct{ aead cipher.AEAD }

func NewAESGCMSecretBox(key []byte) (*AESGCMSecretBox, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &AESGCMSecretBox{aead: aead}, nil
}

func (b *AESGCMSecretBox) Encrypt(plaintext []byte) ([]byte, error) {
	if b == nil || b.aead == nil {
		return nil, ErrDependencyUnavailable
	}
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return b.aead.Seal(nonce, nonce, plaintext, nil), nil
}

func (b *AESGCMSecretBox) Decrypt(ciphertext []byte) ([]byte, error) {
	if len(ciphertext) == 0 {
		return nil, nil
	}
	if b == nil || b.aead == nil || len(ciphertext) < b.aead.NonceSize() {
		return nil, ErrDependencyUnavailable
	}
	nonce, data := ciphertext[:b.aead.NonceSize()], ciphertext[b.aead.NonceSize():]
	return b.aead.Open(nil, nonce, data, nil)
}

// ReloadableMailer gives outbox workers a stable pointer while allowing a
// settings save to atomically replace SMTP credentials for subsequent sends.
type ReloadableMailer struct {
	mu     sync.RWMutex
	mailer Mailer
}

func NewReloadableMailer() *ReloadableMailer     { return &ReloadableMailer{} }
func (m *ReloadableMailer) Reload(mailer Mailer) { m.mu.Lock(); m.mailer = mailer; m.mu.Unlock() }
func (m *ReloadableMailer) Send(ctx context.Context, message OutgoingMail) error {
	m.mu.RLock()
	mailer := m.mailer
	m.mu.RUnlock()
	if mailer == nil {
		return &MailDeliveryError{Code: "not_configured", Temporary: false}
	}
	return mailer.Send(ctx, message)
}
