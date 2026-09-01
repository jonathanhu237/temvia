package postgres

import (
	"context"
	"database/sql"
	"time"

	"example.com/temvia/api/internal/auth/application"
	"example.com/temvia/api/internal/auth/domain"
)

func (s *Store) RequestPasswordReset(ctx context.Context, canonical string, selector, verifierDigest []byte, ttl time.Duration, locale domain.Locale) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var userID string
	err = tx.QueryRowContext(ctx, `SELECT id::text FROM auth_users WHERE email_canonical = $1 FOR UPDATE`, canonical).Scan(&userID)
	if err != nil {
		if err == sql.ErrNoRows {
			return tx.Commit()
		}
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE auth_mail_outbox
		SET canceled_at = clock_timestamp(), last_error_code = 'superseded', lease_token = NULL, lease_expires_at = NULL
		WHERE user_id = $1::uuid AND kind = 'password_reset'
		  AND sent_at IS NULL AND canceled_at IS NULL AND dead_at IS NULL`, userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO auth_password_resets (user_id, selector, verifier_digest, expires_at)
		VALUES ($1::uuid, $2, $3, clock_timestamp() + ($4 * INTERVAL '1 second'))
		ON CONFLICT (user_id) DO UPDATE
		SET selector = EXCLUDED.selector,
		    verifier_digest = EXCLUDED.verifier_digest,
		    expires_at = EXCLUDED.expires_at,
		    created_at = EXCLUDED.created_at`, userID, selector, verifierDigest, ttl.Seconds()); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO auth_mail_outbox (kind, user_id, reset_selector, locale, expires_at, created_at)
		SELECT 'password_reset', user_id, selector, $2, expires_at, created_at
		FROM auth_password_resets WHERE user_id = $1::uuid`, userID, string(locale)); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) PreflightPasswordReset(ctx context.Context, selector, verifierDigest []byte) error {
	var stored []byte
	var valid bool
	err := s.db.QueryRowContext(ctx, `SELECT verifier_digest, expires_at > clock_timestamp() FROM auth_password_resets WHERE selector = $1`, selector).Scan(&stored, &valid)
	if err != nil {
		if err == sql.ErrNoRows {
			return application.ErrInvalidPasswordResetToken
		}
		return err
	}
	if !valid || !equalDigest(stored, verifierDigest) {
		return application.ErrInvalidPasswordResetToken
	}
	return nil
}

func (s *Store) CompletePasswordReset(ctx context.Context, selector, verifierDigest []byte, passwordHash string, locale domain.Locale, notificationTTL time.Duration) (time.Time, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return time.Time{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var userID string
	var stored []byte
	var valid bool
	if err := tx.QueryRowContext(ctx, `
		SELECT r.user_id::text, r.verifier_digest, r.expires_at > clock_timestamp()
		FROM auth_password_resets AS r
		JOIN auth_users AS u ON u.id = r.user_id
		WHERE r.selector = $1
		FOR UPDATE OF r, u`, selector).Scan(&userID, &stored, &valid); err != nil {
		if err == sql.ErrNoRows {
			return time.Time{}, application.ErrInvalidPasswordResetToken
		}
		return time.Time{}, err
	}
	if !valid || !equalDigest(stored, verifierDigest) {
		return time.Time{}, application.ErrInvalidPasswordResetToken
	}

	var changedAt time.Time
	if err := tx.QueryRowContext(ctx, `
		UPDATE auth_users
		SET password_hash = $2, auth_version = auth_version + 1
		WHERE id = $1::uuid AND auth_version < 9223372036854775807
		RETURNING clock_timestamp()`, userID, passwordHash).Scan(&changedAt); err != nil {
		if err == sql.ErrNoRows {
			return time.Time{}, application.ErrDependencyUnavailable
		}
		return time.Time{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM auth_password_resets WHERE user_id = $1::uuid`, userID); err != nil {
		return time.Time{}, err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE auth_mail_outbox
		SET canceled_at = clock_timestamp(), last_error_code = 'superseded', lease_token = NULL, lease_expires_at = NULL
		WHERE user_id = $1::uuid AND kind = 'password_reset'
		  AND sent_at IS NULL AND canceled_at IS NULL AND dead_at IS NULL`, userID); err != nil {
		return time.Time{}, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO auth_mail_outbox (kind, user_id, locale, expires_at, created_at)
		VALUES ('password_changed', $1::uuid, $2, $3::timestamptz + ($4::double precision * INTERVAL '1 second'), $3::timestamptz)`, userID, string(locale), changedAt, notificationTTL.Seconds()); err != nil {
		return time.Time{}, err
	}
	if err := tx.Commit(); err != nil {
		return time.Time{}, err
	}
	return changedAt, nil
}
