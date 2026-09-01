package application

import "errors"

var (
	ErrSetupComplete             = errors.New("setup is complete")
	ErrInvalidSetupToken         = errors.New("invalid setup token")
	ErrAccountNotFound           = errors.New("account not found")
	ErrInvalidCredentials        = errors.New("invalid credentials")
	ErrUnauthenticated           = errors.New("unauthenticated")
	ErrRateLimited               = errors.New("rate limited")
	ErrDependencyUnavailable     = errors.New("dependency unavailable")
	ErrPasswordHashBusy          = errors.New("password hashing capacity unavailable")
	ErrEmailAlreadyRegistered    = errors.New("email already registered")
	ErrInvalidPasswordResetToken = errors.New("invalid password reset token")
	ErrForbidden                 = errors.New("forbidden")
	ErrRoleNotFound              = errors.New("role not found")
	ErrRoleAlreadyExists         = errors.New("role already exists")
	ErrUserNotFound              = errors.New("user not found")
	ErrInvitationNotFound        = errors.New("invitation not found")
	ErrRoleInUse                 = errors.New("role is in use")
	ErrImmutableRole             = errors.New("system role is immutable")
	ErrLastSuperAdmin            = errors.New("at least one super administrator is required")
	ErrStaleRevision             = errors.New("stale revision")
	ErrInvalidRoleSet            = errors.New("invalid role set")
	ErrInvitationPending         = errors.New("invitation is already pending")
	ErrInvitationInvalid         = errors.New("invalid invitation")
)
