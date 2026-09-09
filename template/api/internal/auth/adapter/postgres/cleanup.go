package postgres

import (
	"context"
	"errors"
	"log"
	"time"
)

const stateCleanupBatchSize = 100

// CleanupExpiredRateLimitBuckets removes only rows whose finite retention
// deadline has passed. A request that has locked a bucket is either allowed to
// finish first or causes the cleanup row to be skipped.
func (s *Store) CleanupExpiredRateLimitBuckets(ctx context.Context, batchSize int) (int64, error) {
	if batchSize <= 0 {
		batchSize = stateCleanupBatchSize
	}
	operationCtx, cancel := s.stateContext(ctx)
	defer cancel()
	result, err := s.db.ExecContext(operationCtx, `
		WITH expired AS (
			SELECT buckets.ctid
			FROM auth_rate_limit_buckets AS buckets
			WHERE buckets.expires_at <= clock_timestamp()
			ORDER BY buckets.expires_at
			LIMIT $1
			FOR UPDATE SKIP LOCKED
		)
		DELETE FROM auth_rate_limit_buckets AS buckets
		USING expired
		WHERE buckets.ctid = expired.ctid`, batchSize)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// RunStateCleanup starts the existing-style in-process cleanup loop. Cleanup
// affects storage size only; request-time validity checks remain authoritative.
func (s *Store) RunStateCleanup(ctx context.Context, interval time.Duration) {
	if ctx == nil {
		ctx = context.Background()
	}
	if interval <= 0 {
		interval = time.Minute
	}
	cleanup := func() {
		if _, err := s.CleanupExpiredSessions(ctx, stateCleanupBatchSize); err != nil && ctx.Err() == nil {
			log.Printf("session cleanup failed: %s", stateCleanupErrorCategory(err))
		}
		if _, err := s.CleanupExpiredRateLimitBuckets(ctx, stateCleanupBatchSize); err != nil && ctx.Err() == nil {
			log.Printf("rate-limit cleanup failed: %s", stateCleanupErrorCategory(err))
		}
	}
	cleanup()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cleanup()
		}
	}
}

func stateCleanupErrorCategory(err error) string {
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return "timeout"
	case errors.Is(err, context.Canceled):
		return "canceled"
	default:
		return "storage_error"
	}
}
