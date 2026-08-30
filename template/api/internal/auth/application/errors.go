package application

import "errors"

var (
	ErrSetupComplete          = errors.New("setup is complete")
	ErrInvalidSetupToken      = errors.New("invalid setup token")
	ErrAccountNotFound        = errors.New("account not found")
	ErrInvalidCredentials     = errors.New("invalid credentials")
	ErrUnauthenticated        = errors.New("unauthenticated")
	ErrRateLimited            = errors.New("rate limited")
	ErrDependencyUnavailable  = errors.New("dependency unavailable")
	ErrPasswordHashBusy       = errors.New("password hashing capacity unavailable")
	ErrEmailAlreadyRegistered = errors.New("email already registered")
)
