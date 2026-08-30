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

type PasswordHasher interface {
	Hash(context.Context, string) (string, error)
	Verify(context.Context, string, string) (bool, error)
}

type SessionStore interface {
	Create(context.Context, string, string) error
	ResolveAndTouch(context.Context, string) (userID string, err error)
	Delete(context.Context, string) error
}

type LoginLimiter interface {
	Allow(context.Context, string) (bool, error)
	ResetEmail(context.Context, string) error
}

type RandomSource interface {
	Read([]byte) error
}
