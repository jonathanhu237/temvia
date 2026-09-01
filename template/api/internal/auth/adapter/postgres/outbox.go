package postgres

import (
	"context"
	"database/sql"
	"time"

	"example.com/temvia/api/internal/auth/application"
	"example.com/temvia/api/internal/auth/domain"
)

const outboxMaintenanceBatchSize = 100

func (s *Store) ClaimMail(ctx context.Context, leaseToken string, leaseDuration time.Duration) (*application.MailJob, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	var job application.MailJob
	var kind string
	var locale string
	var selector []byte
	var digest []byte
	var invitationID sql.NullString
	var attempts int
	err = tx.QueryRowContext(ctx, `
		SELECT o.id::text, o.kind, COALESCE(o.user_id::text, ''), o.invitation_id::text,
		       COALESCE(u.name, i.name), COALESCE(u.email, i.email), o.locale,
		       o.reset_selector, COALESCE(r.verifier_digest, i.verifier_digest), o.attempt_count + 1, o.created_at, o.expires_at
		FROM auth_mail_outbox AS o
		LEFT JOIN auth_users AS u ON u.id = o.user_id
		LEFT JOIN auth_user_invitations AS i ON i.id = o.invitation_id
		LEFT JOIN auth_password_resets AS r
		  ON r.user_id = o.user_id AND r.selector = o.reset_selector
		WHERE o.sent_at IS NULL AND o.canceled_at IS NULL AND o.dead_at IS NULL
		  AND o.available_at <= clock_timestamp()
		  AND (o.lease_expires_at IS NULL OR o.lease_expires_at <= clock_timestamp())
		  AND o.expires_at > clock_timestamp()
		  AND (o.kind = 'password_changed'
		       OR (o.kind = 'password_reset' AND r.user_id IS NOT NULL AND r.expires_at > clock_timestamp())
		       OR (o.kind = 'user_invitation' AND i.id IS NOT NULL AND i.expires_at > clock_timestamp()))
		ORDER BY o.created_at, o.id
		FOR UPDATE OF o SKIP LOCKED
		LIMIT 1`,
	).Scan(&job.ID, &kind, &job.UserID, &invitationID, &job.Name, &job.Email, &locale, &selector, &digest, &attempts, &job.CreatedAt, &job.ExpiresAt)
	if err != nil {
		if err == sql.ErrNoRows {
			if err := tx.Commit(); err != nil {
				return nil, err
			}
			return nil, nil
		}
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE auth_mail_outbox
		SET lease_token = $2::uuid,
		    lease_expires_at = clock_timestamp() + ($3 * INTERVAL '1 second'),
		    attempt_count = attempt_count + 1
		WHERE id = $1::uuid`, job.ID, leaseToken, leaseDuration.Seconds()); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	job.Kind = application.MailKind(kind)
	if invitationID.Valid {
		job.InvitationID = invitationID.String
	}
	job.Locale = domain.Locale(locale)
	job.ResetSelector = append([]byte(nil), selector...)
	job.VerifierDigest = append([]byte(nil), digest...)
	job.InvitationSelector = append([]byte(nil), selector...)
	job.InvitationVerifierDigest = append([]byte(nil), digest...)
	job.Attempts = attempts
	job.LeaseToken = leaseToken
	return &job, nil
}

func (s *Store) MarkMailSent(ctx context.Context, id, leaseToken string) (bool, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE auth_mail_outbox
		SET sent_at = clock_timestamp(), lease_token = NULL, lease_expires_at = NULL, last_error_code = NULL
		WHERE id = $1::uuid AND lease_token = $2::uuid
		  AND sent_at IS NULL AND canceled_at IS NULL AND dead_at IS NULL`, id, leaseToken)
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count == 1, err
}

func (s *Store) RetryMail(ctx context.Context, id, leaseToken string, delay time.Duration, errorCode string) (bool, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE auth_mail_outbox
		SET available_at = clock_timestamp() + ($3 * INTERVAL '1 second'),
		    lease_token = NULL, lease_expires_at = NULL, last_error_code = $4
		WHERE id = $1::uuid AND lease_token = $2::uuid
		  AND sent_at IS NULL AND canceled_at IS NULL AND dead_at IS NULL`, id, leaseToken, delay.Seconds(), errorCode)
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count == 1, err
}

func (s *Store) DeadLetterMail(ctx context.Context, id, leaseToken, errorCode string) (bool, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE auth_mail_outbox
		SET dead_at = clock_timestamp(), lease_token = NULL, lease_expires_at = NULL, last_error_code = $3
		WHERE id = $1::uuid AND lease_token = $2::uuid
		  AND sent_at IS NULL AND canceled_at IS NULL AND dead_at IS NULL`, id, leaseToken, errorCode)
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count == 1, err
}

func (s *Store) DiscardMail(ctx context.Context, id, leaseToken, errorCode string) (bool, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE auth_mail_outbox
		SET canceled_at = clock_timestamp(), lease_token = NULL, lease_expires_at = NULL, last_error_code = $3
		WHERE id = $1::uuid AND lease_token = $2::uuid
		  AND sent_at IS NULL AND canceled_at IS NULL AND dead_at IS NULL`, id, leaseToken, errorCode)
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count == 1, err
}

func (s *Store) SweepMail(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `
		WITH expired AS (
			SELECT o.id
			FROM auth_mail_outbox AS o
			WHERE o.sent_at IS NULL AND o.canceled_at IS NULL AND o.dead_at IS NULL
			  AND o.expires_at <= clock_timestamp()
			ORDER BY o.expires_at, o.id
			FOR UPDATE OF o SKIP LOCKED
			LIMIT $1
		)
		UPDATE auth_mail_outbox AS o
		SET canceled_at = clock_timestamp(), lease_token = NULL, lease_expires_at = NULL, last_error_code = 'expired'
		WHERE o.id IN (SELECT id FROM expired)`, outboxMaintenanceBatchSize); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		WITH superseded AS (
			SELECT o.id
			FROM auth_mail_outbox AS o
			WHERE o.kind = 'password_reset'
			  AND o.sent_at IS NULL AND o.canceled_at IS NULL AND o.dead_at IS NULL
			  AND NOT EXISTS (
				SELECT 1 FROM auth_password_resets AS r
				WHERE r.user_id = o.user_id AND r.selector = o.reset_selector
				  AND r.expires_at > clock_timestamp()
			  )
			ORDER BY o.created_at, o.id
			FOR UPDATE OF o SKIP LOCKED
			LIMIT $1
		)
		UPDATE auth_mail_outbox AS o
		SET canceled_at = clock_timestamp(), lease_token = NULL, lease_expires_at = NULL, last_error_code = 'superseded'
		WHERE o.id IN (SELECT id FROM superseded)`, outboxMaintenanceBatchSize); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		WITH expired AS (
			SELECT r.user_id
			FROM auth_password_resets AS r
			WHERE r.expires_at <= clock_timestamp()
			ORDER BY r.expires_at, r.user_id
			FOR UPDATE OF r SKIP LOCKED
			LIMIT $1
		)
		DELETE FROM auth_password_resets AS r
		WHERE r.user_id IN (SELECT user_id FROM expired)`, outboxMaintenanceBatchSize); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) CleanupMail(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `
		WITH doomed AS (
			SELECT o.id
			FROM auth_mail_outbox AS o
			WHERE ((o.sent_at IS NOT NULL OR o.canceled_at IS NOT NULL)
			       AND COALESCE(o.sent_at, o.canceled_at) < clock_timestamp() - INTERVAL '7 days')
			   OR (o.dead_at IS NOT NULL AND o.dead_at < clock_timestamp() - INTERVAL '30 days')
			ORDER BY COALESCE(o.sent_at, o.canceled_at, o.dead_at), o.id
			FOR UPDATE OF o SKIP LOCKED
			LIMIT $1
		)
		DELETE FROM auth_mail_outbox AS o
		WHERE o.id IN (SELECT id FROM doomed)`, outboxMaintenanceBatchSize)
	return err
}
