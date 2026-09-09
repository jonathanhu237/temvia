package postgres

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"time"
)

const (
	rateLimitKindGlobal = "global"
	rateLimitKindEmail  = "email"
)

var globalRateLimitDigest = make([]byte, sha256.Size)

type rateLimitBucket struct {
	tokens       int64
	lastRefilled time.Time
}

func (s *Store) Allow(ctx context.Context, canonicalEmail string) (bool, error) {
	return s.allowBuckets(ctx, canonicalEmail, "login", s.globalCapacity, s.globalRefill, s.emailCapacity, s.emailRefill)
}

func (s *Store) AllowPasswordReset(ctx context.Context, canonicalEmail string) (bool, error) {
	return s.allowBuckets(ctx, canonicalEmail, "password-reset", s.resetGlobalCapacity, s.resetGlobalRefill, s.resetEmailCapacity, s.resetEmailRefill)
}

func (s *Store) allowBuckets(ctx context.Context, canonicalEmail, namespace string, globalCapacity int, globalRefill time.Duration, emailCapacity int, emailRefill time.Duration) (bool, error) {
	if globalCapacity <= 0 || emailCapacity <= 0 || globalRefill <= 0 || emailRefill <= 0 {
		return false, fmt.Errorf("invalid rate-limit settings")
	}
	operationCtx, cancel := s.stateContext(ctx)
	defer cancel()
	tx, err := s.db.BeginTx(operationCtx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()

	emailDigest := rateLimitDigest(canonicalEmail)
	// Always create and lock the global bucket before the per-email bucket.
	// ensureRateLimitBucket holds the row lock through the transaction even
	// when the row already exists, so cleanup/reset cannot remove a bucket
	// between creation and consumption.
	global, err := ensureRateLimitBucket(operationCtx, tx, namespace, rateLimitKindGlobal, globalRateLimitDigest, globalCapacity, bucketTTL(globalCapacity, globalRefill))
	if err != nil {
		return false, err
	}
	email, err := ensureRateLimitBucket(operationCtx, tx, namespace, rateLimitKindEmail, emailDigest, emailCapacity, bucketTTL(emailCapacity, emailRefill))
	if err != nil {
		return false, err
	}
	var now time.Time
	if err := tx.QueryRowContext(operationCtx, `SELECT date_trunc('milliseconds', clock_timestamp())`).Scan(&now); err != nil {
		return false, err
	}
	global.tokens, global.lastRefilled = refillRateLimitBucket(global.tokens, global.lastRefilled, globalCapacity, globalRefill, now)
	email.tokens, email.lastRefilled = refillRateLimitBucket(email.tokens, email.lastRefilled, emailCapacity, emailRefill, now)
	allowed := global.tokens >= 1 && email.tokens >= 1
	if allowed {
		global.tokens--
		email.tokens--
	}
	if err := updateRateLimitBucket(operationCtx, tx, namespace, rateLimitKindGlobal, globalRateLimitDigest, global, now, bucketTTL(globalCapacity, globalRefill)); err != nil {
		return false, err
	}
	if err := updateRateLimitBucket(operationCtx, tx, namespace, rateLimitKindEmail, emailDigest, email, now, bucketTTL(emailCapacity, emailRefill)); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return allowed, nil
}

func (s *Store) ResetEmail(ctx context.Context, canonicalEmail string) error {
	operationCtx, cancel := s.stateContext(ctx)
	defer cancel()
	_, err := s.db.ExecContext(operationCtx, `
		DELETE FROM auth_rate_limit_buckets
		WHERE namespace = 'login' AND bucket_kind = 'email' AND bucket_digest = $1::bytea`, rateLimitDigest(canonicalEmail))
	return err
}

func ensureRateLimitBucket(ctx context.Context, tx *sql.Tx, namespace, kind string, digest []byte, capacity int, ttl time.Duration) (rateLimitBucket, error) {
	var bucket rateLimitBucket
	// DO UPDATE is intentional: unlike DO NOTHING, it locks an existing
	// conflicting row and keeps that lock until the surrounding transaction
	// commits. The no-op update makes creation and locking one operation, so a
	// reset or cleanup cannot delete the row before the caller consumes it.
	err := tx.QueryRowContext(ctx, `
		WITH db_clock AS (SELECT date_trunc('milliseconds', clock_timestamp()) AS now)
		INSERT INTO auth_rate_limit_buckets (
			namespace, bucket_kind, bucket_digest, tokens, last_refill_at, expires_at
		)
		SELECT $1, $2, $3::bytea, $4::bigint, now,
			now + ($5::bigint * INTERVAL '1 millisecond')
		FROM db_clock
		ON CONFLICT (namespace, bucket_kind, bucket_digest) DO UPDATE
		SET tokens = auth_rate_limit_buckets.tokens
		RETURNING tokens, last_refill_at`, namespace, kind, digest, capacity, durationMillis(ttl)).Scan(&bucket.tokens, &bucket.lastRefilled)
	if err != nil {
		return rateLimitBucket{}, err
	}
	bucket.lastRefilled = bucket.lastRefilled.Truncate(time.Millisecond)
	return bucket, nil
}

func updateRateLimitBucket(ctx context.Context, tx *sql.Tx, namespace, kind string, digest []byte, bucket rateLimitBucket, now time.Time, ttl time.Duration) error {
	result, err := tx.ExecContext(ctx, `
		UPDATE auth_rate_limit_buckets
		SET tokens = $4::bigint,
			last_refill_at = $5::timestamptz,
			expires_at = $6::timestamptz + ($7::bigint * INTERVAL '1 millisecond')
		WHERE namespace = $1 AND bucket_kind = $2 AND bucket_digest = $3::bytea`, namespace, kind, digest, bucket.tokens, bucket.lastRefilled, now, durationMillis(ttl))
	if err != nil {
		return err
	}
	if affected, err := result.RowsAffected(); err != nil {
		return err
	} else if affected != 1 {
		return fmt.Errorf("rate-limit bucket disappeared during update")
	}
	return nil
}

func refillRateLimitBucket(tokens int64, last time.Time, capacity int, interval time.Duration, now time.Time) (int64, time.Time) {
	if interval <= 0 || !now.After(last) {
		return tokens, last
	}
	elapsed := now.Sub(last)
	if elapsed < interval {
		return tokens, last
	}
	additions := int64(elapsed / interval)
	if tokens+additions > int64(capacity) {
		tokens = int64(capacity)
	} else {
		tokens += additions
	}
	return tokens, last.Add(time.Duration(additions) * interval)
}

func rateLimitDigest(canonicalEmail string) []byte {
	digest := sha256.Sum256([]byte(canonicalEmail))
	return digest[:]
}

func bucketTTL(capacity int, refill time.Duration) time.Duration {
	return time.Duration(capacity+1) * refill
}
