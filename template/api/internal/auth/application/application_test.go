package application

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"testing"
	"time"

	"example.com/temvia/api/internal/auth/domain"
)

type fakeRandom struct{ value byte }

func (r fakeRandom) Read(dst []byte) error {
	for i := range dst {
		dst[i] = r.value
	}
	return nil
}

type errorRandom struct{}

func (errorRandom) Read([]byte) error { return errors.New("random unavailable") }

type fakeHasher struct {
	hashCalls   int
	verifyCalls int
	valid       bool
}

func TestCompletedSetupDoesNotGenerateAnotherToken(t *testing.T) {
	setup := NewSetup(&fakeSetupStore{complete: true}, &fakeHasher{}, errorRandom{}, time.Minute)
	if token, required, err := setup.IssueStartupToken(context.Background()); err != nil || required || token != "" {
		t.Fatalf("IssueStartupToken(completed) = %q, %t, %v", token, required, err)
	}
}

func TestUnpaddedBase64URLRequiresCanonicalEncoding(t *testing.T) {
	canonical := base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{7}, setupTokenBytes))
	nonCanonical := canonical[:len(canonical)-1] + "d"
	if !isUnpaddedBase64URL(canonical, setupTokenBytes) {
		t.Fatal("canonical credential rejected")
	}
	if isUnpaddedBase64URL(nonCanonical, setupTokenBytes) {
		t.Fatal("non-canonical credential accepted")
	}
}

func (h *fakeHasher) Hash(context.Context, string) (string, error) { h.hashCalls++; return "hash", nil }
func (h *fakeHasher) Verify(context.Context, string, string) (bool, error) {
	h.verifyCalls++
	return h.valid, nil
}

type fakeSetupStore struct {
	complete bool
	digest   []byte
	user     domain.User
}

func (s *fakeSetupStore) Status(context.Context) (bool, error) { return s.complete, nil }
func (s *fakeSetupStore) ReplaceCurrentToken(_ context.Context, digest []byte, _ time.Duration) (bool, error) {
	if s.complete {
		return true, nil
	}
	s.digest = append([]byte(nil), digest...)
	return false, nil
}
func (s *fakeSetupStore) PreflightToken(_ context.Context, digest []byte) error {
	if s.complete {
		return ErrSetupComplete
	}
	if string(s.digest) != string(digest) {
		return ErrInvalidSetupToken
	}
	return nil
}
func (s *fakeSetupStore) Complete(_ context.Context, digest []byte, name domain.Name, email domain.Email, _ string) (domain.User, error) {
	if s.complete {
		return domain.User{}, ErrSetupComplete
	}
	if string(s.digest) != string(digest) {
		return domain.User{}, ErrInvalidSetupToken
	}
	s.complete = true
	s.user = domain.User{ID: "user-1", Name: string(name), Email: email.Display}
	return s.user, nil
}

func TestSetupTokenReplacementAndCompletion(t *testing.T) {
	store := &fakeSetupStore{}
	hasher := &fakeHasher{}
	setup := NewSetup(store, hasher, fakeRandom{value: 7}, time.Minute)
	token, required, err := setup.IssueStartupToken(context.Background())
	if err != nil || !required || len(token) != 43 {
		t.Fatalf("IssueStartupToken() = %q, %t, %v", token, required, err)
	}
	raw, _ := base64.RawURLEncoding.DecodeString(token)
	digest := sha256.Sum256(raw)
	if string(store.digest) != string(digest[:]) {
		t.Fatal("store did not receive token digest")
	}
	user, err := setup.Complete(context.Background(), SetupInput{Token: token, Name: " Ada ", Email: "ADA@EXAMPLE.COM", Password: "Admin1!x"})
	if err != nil || user.Name != "Ada" || user.Email != "ADA@EXAMPLE.COM" || !store.complete || hasher.hashCalls != 1 {
		t.Fatalf("Complete() = %#v, %v; store=%#v hasher=%d", user, err, store, hasher.hashCalls)
	}
	if _, err := setup.Complete(context.Background(), SetupInput{Token: token, Name: "Ada", Email: "ada@example.com", Password: "Admin1!x"}); !errors.Is(err, ErrSetupComplete) {
		t.Fatalf("replay error = %v, want setup complete", err)
	}
}

type fakeAccounts struct{ account domain.Account }

func (a fakeAccounts) FindByCanonicalEmail(_ context.Context, email string) (domain.Account, error) {
	if email != a.account.User.Email {
		return domain.Account{}, ErrAccountNotFound
	}
	return a.account, nil
}
func (a fakeAccounts) FindPublicByID(context.Context, string) (domain.User, error) {
	return a.account.User, nil
}

type fakeLimiter struct {
	allow bool
	reset int
}

func (l *fakeLimiter) Allow(context.Context, string) (bool, error) { return l.allow, nil }
func (l *fakeLimiter) ResetEmail(context.Context, string) error    { l.reset++; return nil }

type fakeSessions struct{ created, deleted string }

func (s *fakeSessions) Create(_ context.Context, id, _ string) error            { s.created = id; return nil }
func (s *fakeSessions) ResolveAndTouch(context.Context, string) (string, error) { return "user-1", nil }
func (s *fakeSessions) Delete(_ context.Context, id string) error               { s.deleted = id; return nil }

func TestAuthenticationFlowAndUnknownEmail(t *testing.T) {
	account := domain.Account{User: domain.User{ID: "user-1", Name: "Ada", Email: "ada@example.com"}, PasswordHash: "hash"}
	hasher := &fakeHasher{valid: true}
	limiter := &fakeLimiter{allow: true}
	sessions := &fakeSessions{}
	auth := NewAuthentication(fakeAccounts{account}, hasher, sessions, limiter, fakeRandom{value: 8})
	user, session, err := auth.Login(context.Background(), LoginInput{Email: "ADA@EXAMPLE.COM", Password: "a sufficiently long password"})
	if err != nil || user.ID != "user-1" || len(session) != 43 || sessions.created != session || limiter.reset != 1 {
		t.Fatalf("Login() = %#v, %q, %v", user, session, err)
	}
	if _, err := auth.Current(context.Background(), session); err != nil {
		t.Fatalf("Current() error = %v", err)
	}
	if err := auth.Logout(context.Background(), session); err != nil || sessions.deleted != session {
		t.Fatalf("Logout() = %v, deleted=%q", err, sessions.deleted)
	}
	hasher.verifyCalls = 0
	if _, _, err := auth.Login(context.Background(), LoginInput{Email: "unknown@example.com", Password: "a sufficiently long password"}); !errors.Is(err, ErrInvalidCredentials) || hasher.verifyCalls != 0 {
		t.Fatalf("unknown login = %v, verify calls=%d", err, hasher.verifyCalls)
	}
}
