package application

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"

	"example.com/temvia/api/internal/auth/domain"
)

const sessionIDBytes = 32

type LoginInput struct {
	Email    string
	Password string
}

type Authentication struct {
	accounts AccountStore
	hasher   PasswordHasher
	sessions SessionStore
	limiter  LoginLimiter
	random   RandomSource
}

func NewAuthentication(accounts AccountStore, hasher PasswordHasher, sessions SessionStore, limiter LoginLimiter, random RandomSource) *Authentication {
	return &Authentication{accounts: accounts, hasher: hasher, sessions: sessions, limiter: limiter, random: random}
}

func (a *Authentication) Login(ctx context.Context, input LoginInput) (domain.User, string, error) {
	email, err := domain.NewEmail(input.Email)
	if err != nil {
		return domain.User{}, "", err
	}
	password, err := domain.NewLoginPassword(input.Password)
	if err != nil {
		return domain.User{}, "", err
	}
	allowed, err := a.limiter.Allow(ctx, email.Canonical)
	if err != nil {
		return domain.User{}, "", dependencyError(err)
	}
	if !allowed {
		return domain.User{}, "", ErrRateLimited
	}
	account, err := a.accounts.FindByCanonicalEmail(ctx, email.Canonical)
	if err != nil {
		if errors.Is(err, ErrAccountNotFound) {
			return domain.User{}, "", ErrInvalidCredentials
		}
		return domain.User{}, "", dependencyError(err)
	}
	valid, err := a.hasher.Verify(ctx, account.PasswordHash, string(password))
	if err != nil {
		if errors.Is(err, ErrPasswordHashBusy) {
			return domain.User{}, "", ErrDependencyUnavailable
		}
		return domain.User{}, "", dependencyError(err)
	}
	if !valid {
		return domain.User{}, "", ErrInvalidCredentials
	}
	if err := a.limiter.ResetEmail(ctx, email.Canonical); err != nil {
		return domain.User{}, "", dependencyError(err)
	}
	raw := make([]byte, sessionIDBytes)
	if err := a.random.Read(raw); err != nil {
		return domain.User{}, "", dependencyError(err)
	}
	sessionID := base64.RawURLEncoding.EncodeToString(raw)
	if err := a.sessions.Create(ctx, sessionID, account.User.ID); err != nil {
		return domain.User{}, "", dependencyError(err)
	}
	return account.User, sessionID, nil
}

func (a *Authentication) Current(ctx context.Context, sessionID string) (domain.User, error) {
	if !isUnpaddedBase64URL(sessionID, sessionIDBytes) {
		return domain.User{}, ErrUnauthenticated
	}
	userID, err := a.sessions.ResolveAndTouch(ctx, sessionID)
	if err != nil {
		return domain.User{}, dependencyError(err)
	}
	if userID == "" {
		return domain.User{}, ErrUnauthenticated
	}
	user, err := a.accounts.FindPublicByID(ctx, userID)
	if err != nil {
		if errors.Is(err, ErrAccountNotFound) {
			return domain.User{}, ErrUnauthenticated
		}
		return domain.User{}, dependencyError(err)
	}
	return user, nil
}

func (a *Authentication) Logout(ctx context.Context, sessionID string) error {
	if sessionID == "" {
		return nil
	}
	if !isUnpaddedBase64URL(sessionID, sessionIDBytes) {
		return nil
	}
	if err := a.sessions.Delete(ctx, sessionID); err != nil {
		return dependencyError(err)
	}
	return nil
}

// cryptoRandom is kept as a small adapter so use cases remain testable.
type cryptoRandom struct{}

func (cryptoRandom) Read(dst []byte) error {
	_, err := rand.Read(dst)
	return err
}

func CryptoRandom() RandomSource { return cryptoRandom{} }
