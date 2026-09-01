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
	catalog  domain.PermissionCatalog
}

func NewAuthentication(accounts AccountStore, hasher PasswordHasher, sessions SessionStore, limiter LoginLimiter, random RandomSource, catalogs ...domain.PermissionCatalog) *Authentication {
	catalog := domain.DefaultPermissionCatalog()
	if len(catalogs) > 0 && len(catalogs[0].Definitions()) > 0 {
		catalog = catalogs[0]
	}
	return &Authentication{accounts: accounts, hasher: hasher, sessions: sessions, limiter: limiter, random: random, catalog: catalog}
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
	authVersion := account.AuthVersion
	if authVersion <= 0 {
		// A versioned session store is only safe when the PostgreSQL-backed
		// account version is authoritative. Do not silently turn a malformed
		// or missing version into the initial version in that mode.
		if _, ok := a.sessions.(VersionedSessionStore); ok {
			return domain.User{}, "", ErrDependencyUnavailable
		}
		authVersion = 1
	}
	var createErr error
	if versioned, ok := a.sessions.(VersionedSessionStore); ok {
		createErr = versioned.CreateVersioned(ctx, sessionID, account.User.ID, authVersion)
	} else {
		createErr = a.sessions.Create(ctx, sessionID, account.User.ID)
	}
	if err := createErr; err != nil {
		return domain.User{}, "", dependencyError(err)
	}
	return account.User, sessionID, nil
}

func (a *Authentication) Current(ctx context.Context, sessionID string) (domain.User, error) {
	if !isUnpaddedBase64URL(sessionID, sessionIDBytes) {
		return domain.User{}, ErrUnauthenticated
	}
	versioned, hasVersionedSession := a.sessions.(VersionedSessionStore)
	var userID string
	var sessionVersion int64
	var err error
	if hasVersionedSession {
		userID, sessionVersion, err = versioned.ResolveAndTouchVersioned(ctx, sessionID)
	} else {
		userID, err = a.sessions.ResolveAndTouch(ctx, sessionID)
	}
	if err != nil {
		return domain.User{}, dependencyError(err)
	}
	if userID == "" {
		return domain.User{}, ErrUnauthenticated
	}
	if hasVersionedSession {
		versionedAccounts, ok := a.accounts.(VersionedAccountStore)
		if !ok {
			// Falling back to FindPublicByID would authorize a versioned Redis
			// session without checking the PostgreSQL revocation authority.
			return domain.User{}, ErrDependencyUnavailable
		}
		account, err := versionedAccounts.FindPublicAccountByID(ctx, userID)
		if err != nil {
			if errors.Is(err, ErrAccountNotFound) {
				return domain.User{}, ErrUnauthenticated
			}
			return domain.User{}, dependencyError(err)
		}
		if account.AuthVersion <= 0 || sessionVersion != account.AuthVersion {
			// PostgreSQL auth_version is the revocation authority. Redis
			// deletion is only cleanup and cannot turn this into a 503.
			_ = a.sessions.Delete(ctx, sessionID)
			return domain.User{}, ErrUnauthenticated
		}
		return account.User, nil
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

// PrincipalStore enriches the authenticated identity with its current role
// assignments. It is intentionally optional so the original authentication
// seams remain usable by small consumers and tests.
type PrincipalStore interface {
	FindPrincipalByID(context.Context, string) (domain.Principal, error)
}

type PrincipalAuthenticationService interface {
	LoginWithPrincipal(context.Context, LoginInput) (domain.Principal, string, error)
	CurrentPrincipal(context.Context, string) (domain.Principal, error)
}

func (a *Authentication) LoginWithPrincipal(ctx context.Context, input LoginInput) (domain.Principal, string, error) {
	user, sessionID, err := a.Login(ctx, input)
	if err != nil {
		return domain.Principal{}, "", err
	}
	store, ok := a.accounts.(PrincipalStore)
	if !ok {
		return domain.Principal{User: user}, sessionID, nil
	}
	principal, err := store.FindPrincipalByID(ctx, user.ID)
	if err != nil {
		_ = a.sessions.Delete(ctx, sessionID)
		return domain.Principal{}, "", dependencyError(err)
	}
	if err := ensurePrincipalIdentity(user.ID, principal); err != nil {
		_ = a.sessions.Delete(ctx, sessionID)
		return domain.Principal{}, "", err
	}
	principal, err = a.normalizePrincipal(principal)
	if err != nil {
		_ = a.sessions.Delete(ctx, sessionID)
		return domain.Principal{}, "", err
	}
	return principal, sessionID, nil
}

func (a *Authentication) CurrentPrincipal(ctx context.Context, sessionID string) (domain.Principal, error) {
	user, err := a.Current(ctx, sessionID)
	if err != nil {
		return domain.Principal{}, err
	}
	store, ok := a.accounts.(PrincipalStore)
	if !ok {
		return domain.Principal{User: user}, nil
	}
	principal, err := store.FindPrincipalByID(ctx, user.ID)
	if err != nil {
		return domain.Principal{}, dependencyError(err)
	}
	if err := ensurePrincipalIdentity(user.ID, principal); err != nil {
		return domain.Principal{}, err
	}
	return a.normalizePrincipal(principal)
}

func (a *Authentication) normalizePrincipal(principal domain.Principal) (domain.Principal, error) {
	return normalizePrincipal(a.catalog, principal)
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
