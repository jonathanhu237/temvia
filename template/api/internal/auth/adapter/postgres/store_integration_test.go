package postgres

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"example.com/temvia/api/internal/auth/application"
	"example.com/temvia/api/internal/auth/domain"
	_ "github.com/jackc/pgx/v5/stdlib"
)

func TestStoreIntegrationSetupLifecycleAndConcurrency(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not set")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	store := NewStore(db)
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		if err := resetAuthState(cleanupCtx, db); err != nil {
			t.Errorf("reset auth state: %v", err)
		}
		_ = db.Close()
	})
	if err := resetAuthState(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := store.CheckSchema(ctx); err != nil {
		t.Fatalf("CheckSchema() error = %v", err)
	}

	digest := sha256.Sum256([]byte("setup token"))
	complete, err := store.ReplaceCurrentToken(ctx, digest[:], time.Minute)
	if err != nil || complete {
		t.Fatalf("ReplaceCurrentToken() = %t, %v", complete, err)
	}
	if err := store.PreflightToken(ctx, digest[:]); err != nil {
		t.Fatalf("PreflightToken(valid) error = %v", err)
	}
	wrong := sha256.Sum256([]byte("wrong token"))
	if err := store.PreflightToken(ctx, wrong[:]); !errors.Is(err, application.ErrInvalidSetupToken) {
		t.Fatalf("PreflightToken(wrong) error = %v", err)
	}

	name, _ := domain.NewName("Ada")
	email, _ := domain.NewEmail("ada@example.com")
	const attempts = 2
	results := make(chan error, attempts)
	users := make(chan domain.User, attempts)
	var wg sync.WaitGroup
	for range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			user, err := store.Complete(ctx, digest[:], name, email, "$argon2id$test")
			if err == nil {
				users <- user
			}
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	close(users)
	var successes, completed int
	for err := range results {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, application.ErrSetupComplete):
			completed++
		default:
			t.Fatalf("concurrent Complete() unexpected error = %v", err)
		}
	}
	if successes != 1 || completed != 1 {
		t.Fatalf("concurrent Complete() successes=%d completed=%d", successes, completed)
	}
	user := <-users
	var version int
	if err := db.QueryRowContext(ctx, `SELECT uuid_extract_version($1::uuid)`, user.ID).Scan(&version); err != nil || version != 7 {
		t.Fatalf("user ID %q UUID version = %d, %v", user.ID, version, err)
	}
	if complete, err := store.Status(ctx); err != nil || !complete {
		t.Fatalf("Status() = %t, %v", complete, err)
	}
	if err := store.PreflightToken(ctx, digest[:]); !errors.Is(err, application.ErrSetupComplete) {
		t.Fatalf("PreflightToken(after completion) error = %v", err)
	}
}

func TestStoreIntegrationRejectsNonExactSchemaVersions(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not set")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	var originalVersion int64
	var originalDirty bool
	if err := db.QueryRowContext(ctx, `SELECT version, dirty FROM schema_migrations`).Scan(&originalVersion, &originalDirty); err != nil {
		t.Fatal(err)
	}
	if originalVersion != ExpectedMigrationVersion || originalDirty {
		t.Fatalf("integration database starts at version %d dirty=%t", originalVersion, originalDirty)
	}
	restore := func() error {
		restoreCtx, restoreCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer restoreCancel()
		_, err := db.ExecContext(restoreCtx, `UPDATE schema_migrations SET version = $1, dirty = $2`, originalVersion, originalDirty)
		return err
	}
	t.Cleanup(func() {
		if err := restore(); err != nil {
			t.Errorf("restore migration state: %v", err)
		}
	})

	store := NewStore(db)
	for _, test := range []struct {
		name    string
		version int64
		dirty   bool
	}{
		{name: "dirty", version: ExpectedMigrationVersion, dirty: true},
		{name: "behind", version: ExpectedMigrationVersion - 1},
		{name: "ahead", version: ExpectedMigrationVersion + 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := db.ExecContext(ctx, `UPDATE schema_migrations SET version = $1, dirty = $2`, test.version, test.dirty); err != nil {
				t.Fatal(err)
			}
			if err := store.CheckSchema(ctx); !errors.Is(err, ErrSchemaNotReady) {
				t.Fatalf("CheckSchema() error = %v, want schema not ready", err)
			}
		})
	}
	if err := restore(); err != nil {
		t.Fatal(err)
	}
}

func resetAuthState(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, `DELETE FROM auth_users`); err != nil {
		return err
	}
	_, err := db.ExecContext(ctx, `UPDATE auth_setup SET token_digest = NULL, token_expires_at = NULL, completed_at = NULL WHERE singleton = true`)
	return err
}
