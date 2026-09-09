package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"example.com/temvia/api/internal/auth/application"
	"example.com/temvia/api/internal/auth/domain"
	"example.com/temvia/api/internal/config"
	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const ExpectedMigrationVersion int64 = 8

const stateOperationTimeout = time.Second

var ErrSchemaNotReady = errors.New("database schema is not ready")

type Store struct {
	db                  *sql.DB
	operationTimeout    time.Duration
	idleTimeout         time.Duration
	absoluteTimeout     time.Duration
	globalCapacity      int
	globalRefill        time.Duration
	emailCapacity       int
	emailRefill         time.Duration
	resetGlobalCapacity int
	resetGlobalRefill   time.Duration
	resetEmailCapacity  int
	resetEmailRefill    time.Duration
}

func Open(ctx context.Context, cfg config.Config) (*sql.DB, error) {
	db, err := sql.Open("pgx", cfg.DatabaseDSN())
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	db.SetMaxOpenConns(cfg.DBMaxOpenConns)
	db.SetMaxIdleConns(cfg.DBMaxIdleConns)
	db.SetConnMaxIdleTime(cfg.DBConnMaxIdleTime)
	db.SetConnMaxLifetime(cfg.DBConnMaxLifetime)
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return db, nil
}

func NewStore(db *sql.DB, configs ...config.Config) *Store {
	settings := config.Config{
		SessionIdleTimeout:          30 * time.Minute,
		SessionAbsoluteTimeout:      12 * time.Hour,
		LoginGlobalCapacity:         10,
		LoginGlobalRefillInterval:   6 * time.Second,
		LoginEmailCapacity:          5,
		LoginEmailRefillInterval:    time.Minute,
		PasswordResetGlobalCapacity: 10,
		PasswordResetGlobalRefill:   6 * time.Second,
		PasswordResetEmailCapacity:  3,
		PasswordResetEmailRefill:    20 * time.Minute,
	}
	if len(configs) > 0 {
		settings = configs[0]
		if settings.SessionIdleTimeout <= 0 {
			settings.SessionIdleTimeout = 30 * time.Minute
		}
		if settings.SessionAbsoluteTimeout <= 0 {
			settings.SessionAbsoluteTimeout = 12 * time.Hour
		}
		if settings.LoginGlobalCapacity <= 0 {
			settings.LoginGlobalCapacity = 10
		}
		if settings.LoginGlobalRefillInterval <= 0 {
			settings.LoginGlobalRefillInterval = 6 * time.Second
		}
		if settings.LoginEmailCapacity <= 0 {
			settings.LoginEmailCapacity = 5
		}
		if settings.LoginEmailRefillInterval <= 0 {
			settings.LoginEmailRefillInterval = time.Minute
		}
		if settings.PasswordResetGlobalCapacity <= 0 {
			settings.PasswordResetGlobalCapacity = 10
		}
		if settings.PasswordResetGlobalRefill <= 0 {
			settings.PasswordResetGlobalRefill = 6 * time.Second
		}
		if settings.PasswordResetEmailCapacity <= 0 {
			settings.PasswordResetEmailCapacity = 3
		}
		if settings.PasswordResetEmailRefill <= 0 {
			settings.PasswordResetEmailRefill = 20 * time.Minute
		}
	}
	return &Store{
		db:                  db,
		operationTimeout:    stateOperationTimeout,
		idleTimeout:         settings.SessionIdleTimeout,
		absoluteTimeout:     settings.SessionAbsoluteTimeout,
		globalCapacity:      settings.LoginGlobalCapacity,
		globalRefill:        settings.LoginGlobalRefillInterval,
		emailCapacity:       settings.LoginEmailCapacity,
		emailRefill:         settings.LoginEmailRefillInterval,
		resetGlobalCapacity: settings.PasswordResetGlobalCapacity,
		resetGlobalRefill:   settings.PasswordResetGlobalRefill,
		resetEmailCapacity:  settings.PasswordResetEmailCapacity,
		resetEmailRefill:    settings.PasswordResetEmailRefill,
	}
}

func (s *Store) CheckSchema(ctx context.Context) error {
	var version int64
	var dirty bool
	err := s.db.QueryRowContext(ctx, `SELECT version, dirty FROM schema_migrations ORDER BY version DESC LIMIT 1`).Scan(&version, &dirty)
	if err != nil {
		return fmt.Errorf("%w: read migration state: %v", ErrSchemaNotReady, err)
	}
	if dirty || version != ExpectedMigrationVersion {
		return fmt.Errorf("%w: expected version %d clean, got version %d dirty=%t", ErrSchemaNotReady, ExpectedMigrationVersion, version, dirty)
	}
	return nil
}

func (s *Store) Status(ctx context.Context) (bool, error) {
	var complete bool
	err := s.db.QueryRowContext(ctx, `SELECT completed_at IS NOT NULL FROM auth_setup WHERE singleton = true`).Scan(&complete)
	if err != nil {
		return false, err
	}
	return complete, nil
}

func (s *Store) ReplaceCurrentToken(ctx context.Context, digest []byte, ttl time.Duration) (bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	var completedAt sql.NullTime
	if err := tx.QueryRowContext(ctx, `SELECT completed_at FROM auth_setup WHERE singleton = true FOR UPDATE`).Scan(&completedAt); err != nil {
		return false, err
	}
	if completedAt.Valid {
		return true, tx.Commit()
	}
	_, err = tx.ExecContext(ctx, `UPDATE auth_setup SET token_digest = $1, token_expires_at = clock_timestamp() + ($2 * INTERVAL '1 second') WHERE singleton = true`, digest, ttl.Seconds())
	if err != nil {
		return false, err
	}
	return false, tx.Commit()
}

func (s *Store) PreflightToken(ctx context.Context, digest []byte) error {
	var complete bool
	var stored []byte
	var valid bool
	err := s.db.QueryRowContext(ctx, `SELECT completed_at IS NOT NULL, token_digest, COALESCE(token_expires_at > clock_timestamp(), false) FROM auth_setup WHERE singleton = true`).Scan(&complete, &stored, &valid)
	if err != nil {
		return err
	}
	if complete {
		return application.ErrSetupComplete
	}
	if !valid || !equalDigest(stored, digest) {
		return application.ErrInvalidSetupToken
	}
	return nil
}

func equalDigest(left, right []byte) bool {
	if len(left) != len(right) {
		return false
	}
	var different byte
	for i := range left {
		different |= left[i] ^ right[i]
	}
	return different == 0
}

func (s *Store) Complete(ctx context.Context, digest []byte, name domain.Name, email domain.Email, passwordHash string) (domain.User, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.User{}, err
	}
	defer func() { _ = tx.Rollback() }()
	var completedAt sql.NullTime
	var stored []byte
	var valid bool
	if err := tx.QueryRowContext(ctx, `SELECT completed_at, token_digest, COALESCE(token_expires_at > clock_timestamp(), false) FROM auth_setup WHERE singleton = true FOR UPDATE`).Scan(&completedAt, &stored, &valid); err != nil {
		return domain.User{}, err
	}
	if completedAt.Valid {
		return domain.User{}, application.ErrSetupComplete
	}
	if !valid || !equalDigest(stored, digest) {
		return domain.User{}, application.ErrInvalidSetupToken
	}
	var user domain.User
	err = tx.QueryRowContext(ctx, `INSERT INTO auth_users (name, email, email_canonical, password_hash) VALUES ($1, $2, $3, $4) RETURNING id::text, name, email, created_at`, string(name), email.Display, email.Canonical, passwordHash).Scan(&user.ID, &user.Name, &user.Email, &user.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return domain.User{}, application.ErrEmailAlreadyRegistered
		}
		return domain.User{}, err
	}
	// Migration 3 creates the immutable system role before the setup flow can
	// complete. Keep the first assignment in the same winner transaction so a
	// fresh install is never left with an administrator who cannot administer
	// access.
	result, err := tx.ExecContext(ctx, `
		INSERT INTO auth_user_roles (user_id, role_id)
		SELECT $1::uuid, id FROM auth_roles WHERE system_key = 'super_admin'`, user.ID)
	if err != nil {
		return domain.User{}, err
	}
	if assigned, err := result.RowsAffected(); err != nil || assigned != 1 {
		if err != nil {
			return domain.User{}, err
		}
		return domain.User{}, application.ErrDependencyUnavailable
	}
	if _, err := tx.ExecContext(ctx, `UPDATE auth_setup SET token_digest = NULL, token_expires_at = NULL, completed_at = clock_timestamp() WHERE singleton = true`); err != nil {
		return domain.User{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.User{}, err
	}
	return user, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
