package application

import (
	"context"
	"errors"
	"time"

	"example.com/temvia/api/internal/auth/domain"
)

const passwordResetSelectorBytes = domain.PasswordResetSelectorBytes

type PasswordResetRequestInput struct {
	Email  string
	Locale string
}

type PasswordResetCompleteInput struct {
	Token    string
	Password string
	Locale   string
}

type PasswordRecovery struct {
	store       PasswordResetStore
	limiter     PasswordResetLimiter
	hasher      PasswordHasher
	random      RandomSource
	tokenKey    []byte
	linkTTL     time.Duration
	noticeTTL   time.Duration
	minResponse time.Duration
	now         func() time.Time
	sleep       func(time.Duration)
}

func NewPasswordRecovery(store PasswordResetStore, limiter PasswordResetLimiter, hasher PasswordHasher, random RandomSource, tokenKey []byte, linkTTL, noticeTTL, minResponse time.Duration) *PasswordRecovery {
	return &PasswordRecovery{
		store:       store,
		limiter:     limiter,
		hasher:      hasher,
		random:      random,
		tokenKey:    append([]byte(nil), tokenKey...),
		linkTTL:     linkTTL,
		noticeTTL:   noticeTTL,
		minResponse: minResponse,
		now:         time.Now,
		sleep:       time.Sleep,
	}
}

// NewPasswordRecoveryWithClock makes the response-timing behavior deterministic
// in application tests without exposing timing controls to production wiring.
func NewPasswordRecoveryWithClock(store PasswordResetStore, limiter PasswordResetLimiter, hasher PasswordHasher, random RandomSource, tokenKey []byte, linkTTL, noticeTTL, minResponse time.Duration, now func() time.Time, sleep func(time.Duration)) *PasswordRecovery {
	recovery := NewPasswordRecovery(store, limiter, hasher, random, tokenKey, linkTTL, noticeTTL, minResponse)
	if now != nil {
		recovery.now = now
	}
	if sleep != nil {
		recovery.sleep = sleep
	}
	return recovery
}

func (r *PasswordRecovery) Request(ctx context.Context, input PasswordResetRequestInput) error {
	started := r.now()
	email, err := domain.NewEmail(input.Email)
	if err != nil {
		return err
	}
	locale, err := parseLocale(input.Locale)
	if err != nil {
		return err
	}
	if r.limiter == nil || r.store == nil || r.random == nil {
		return ErrDependencyUnavailable
	}
	allowed, err := r.limiter.AllowPasswordReset(ctx, email.Canonical)
	if err != nil {
		return dependencyError(err)
	}
	if !allowed {
		return ErrRateLimited
	}

	// This selector/HMAC work happens for both known and unknown addresses. The
	// store owns the conditional account lookup and never returns its outcome.
	selector := make([]byte, passwordResetSelectorBytes)
	if err := r.random.Read(selector); err != nil {
		return dependencyError(err)
	}
	material, err := domain.NewPasswordResetMaterial(r.tokenKey, selector)
	if err != nil {
		return dependencyError(err)
	}
	if err := r.store.RequestPasswordReset(ctx, email.Canonical, material.Selector, material.VerifierDigest, r.linkTTL, locale); err != nil {
		return dependencyError(err)
	}
	r.waitMinimum(started)
	return nil
}

func (r *PasswordRecovery) Complete(ctx context.Context, input PasswordResetCompleteInput) error {
	selector, verifierDigest, ok := domain.ParsePasswordResetToken(input.Token)
	if !ok {
		return ErrInvalidPasswordResetToken
	}
	locale, err := parseLocale(input.Locale)
	if err != nil {
		return err
	}
	if r.store == nil {
		return ErrDependencyUnavailable
	}
	// Preflight is deliberately cheap and happens before Argon2 work. The
	// transaction revalidates the same digest under a row lock after hashing.
	if err := r.store.PreflightPasswordReset(ctx, selector, verifierDigest); err != nil {
		switch {
		case isPasswordResetTokenError(err):
			return ErrInvalidPasswordResetToken
		default:
			return dependencyError(err)
		}
	}
	password, err := domain.NewPassword(input.Password)
	if err != nil {
		return err
	}
	if r.hasher == nil {
		return ErrDependencyUnavailable
	}
	hash, err := r.hasher.Hash(ctx, string(password))
	if err != nil {
		if errors.Is(err, ErrPasswordHashBusy) {
			return ErrDependencyUnavailable
		}
		return dependencyError(err)
	}
	if _, err := r.store.CompletePasswordReset(ctx, selector, verifierDigest, hash, locale, r.noticeTTL); err != nil {
		if isPasswordResetTokenError(err) {
			return ErrInvalidPasswordResetToken
		}
		return dependencyError(err)
	}
	return nil
}

func (r *PasswordRecovery) waitMinimum(started time.Time) {
	if r.minResponse <= 0 || r.sleep == nil {
		return
	}
	remaining := r.minResponse - r.now().Sub(started)
	if remaining > 0 {
		r.sleep(remaining)
	}
}

func parseLocale(value string) (domain.Locale, error) {
	locale := domain.Locale(value)
	if locale.Valid() {
		return locale, nil
	}
	return "", &domain.ValidationErrors{Items: []domain.FieldError{{Field: "locale", Code: "invalid_locale"}}}
}

func isPasswordResetTokenError(err error) bool {
	return errors.Is(err, ErrInvalidPasswordResetToken)
}
