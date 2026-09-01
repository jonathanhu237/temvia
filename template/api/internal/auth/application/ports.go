package application

import (
	"context"
	"time"

	"example.com/temvia/api/internal/auth/domain"
)

type SetupStore interface {
	Status(context.Context) (bool, error)
	ReplaceCurrentToken(context.Context, []byte, time.Duration) (complete bool, err error)
	PreflightToken(context.Context, []byte) error
	Complete(context.Context, []byte, domain.Name, domain.Email, string) (domain.User, error)
}

type AccountStore interface {
	FindByCanonicalEmail(context.Context, string) (domain.Account, error)
	FindPublicByID(context.Context, string) (domain.User, error)
}

// VersionedAccountStore is implemented by stores that participate in
// password-reset session revocation. AccountStore remains intentionally
// narrow so existing adapters and tests can still resolve public users.
type VersionedAccountStore interface {
	FindPublicAccountByID(context.Context, string) (domain.Account, error)
}

type PasswordHasher interface {
	Hash(context.Context, string) (string, error)
	Verify(context.Context, string, string) (bool, error)
}

type SessionStore interface {
	Create(context.Context, string, string) error
	ResolveAndTouch(context.Context, string) (userID string, err error)
	Delete(context.Context, string) error
}

type VersionedSessionStore interface {
	CreateVersioned(context.Context, string, string, int64) error
	ResolveAndTouchVersioned(context.Context, string) (userID string, authVersion int64, err error)
}

type LoginLimiter interface {
	Allow(context.Context, string) (bool, error)
	ResetEmail(context.Context, string) error
}

type PasswordResetLimiter interface {
	AllowPasswordReset(context.Context, string) (bool, error)
}

type PasswordResetStore interface {
	RequestPasswordReset(context.Context, string, []byte, []byte, time.Duration, domain.Locale) error
	PreflightPasswordReset(context.Context, []byte, []byte) error
	CompletePasswordReset(context.Context, []byte, []byte, string, domain.Locale, time.Duration) (time.Time, error)
}

type MailKind string

const (
	MailPasswordReset   MailKind = "password_reset"
	MailPasswordChanged MailKind = "password_changed"
)

type MailJob struct {
	ID             string
	Kind           MailKind
	UserID         string
	Name           string
	Email          string
	Locale         domain.Locale
	ResetSelector  []byte
	VerifierDigest []byte
	Attempts       int
	LeaseToken     string
	CreatedAt      time.Time
	ExpiresAt      time.Time
}

type MailOutboxStore interface {
	ClaimMail(context.Context, string, time.Duration) (*MailJob, error)
	MarkMailSent(context.Context, string, string) (bool, error)
	RetryMail(context.Context, string, string, time.Duration, string) (bool, error)
	DeadLetterMail(context.Context, string, string, string) (bool, error)
	DiscardMail(context.Context, string, string, string) (bool, error)
	SweepMail(context.Context) error
	CleanupMail(context.Context) error
}

type OutgoingMail struct {
	MessageID string
	Kind      MailKind
	Name      string
	To        string
	Locale    domain.Locale
	Subject   string
	Text      string
	HTML      string
}

type Mailer interface {
	Send(context.Context, OutgoingMail) error
}

type MailDeliveryError struct {
	Code      string
	Temporary bool
}

func (e *MailDeliveryError) Error() string {
	if e == nil {
		return "mail delivery failed"
	}
	return "mail delivery " + e.Code
}

type RandomSource interface {
	Read([]byte) error
}
