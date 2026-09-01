package postgres

import (
	"bytes"
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
	if _, err := db.ExecContext(ctx, `DELETE FROM auth_user_invitations`); err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM auth_users`); err != nil {
		return err
	}
	_, err := db.ExecContext(ctx, `UPDATE auth_setup SET token_digest = NULL, token_expires_at = NULL, completed_at = NULL WHERE singleton = true`)
	return err
}

func TestStoreIntegrationPasswordRecoveryOutboxAndVersionedSessions(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not set")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
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

	const email = "recovery@example.com"
	var userID string
	if err := db.QueryRowContext(ctx, `
		INSERT INTO auth_users (name, email, email_canonical, password_hash)
		VALUES ('Recovery User', $1, $1, 'old-hash')
		RETURNING id::text`, email).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	key := bytes.Repeat([]byte{0x2a}, domain.PasswordResetVerifierBytes)
	materialOne, err := domain.NewPasswordResetMaterial(key, bytes.Repeat([]byte{0x11}, domain.PasswordResetSelectorBytes))
	if err != nil {
		t.Fatal(err)
	}
	materialTwo, err := domain.NewPasswordResetMaterial(key, bytes.Repeat([]byte{0x22}, domain.PasswordResetSelectorBytes))
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RequestPasswordReset(ctx, email, materialOne.Selector, materialOne.VerifierDigest, time.Hour, domain.LocaleEnglish); err != nil {
		t.Fatalf("RequestPasswordReset(first) error = %v", err)
	}
	if err := store.RequestPasswordReset(ctx, email, materialTwo.Selector, materialTwo.VerifierDigest, time.Hour, domain.LocaleChinese); err != nil {
		t.Fatalf("RequestPasswordReset(replacement) error = %v", err)
	}
	var currentSelector []byte
	if err := db.QueryRowContext(ctx, `SELECT selector FROM auth_password_resets WHERE user_id = $1::uuid`, userID).Scan(&currentSelector); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(currentSelector, materialTwo.Selector) {
		t.Fatalf("current selector = %x, want replacement", currentSelector)
	}
	var outboxCount, canceledCount int
	if err := db.QueryRowContext(ctx, `
		SELECT count(*), count(*) FILTER (WHERE canceled_at IS NOT NULL)
		FROM auth_mail_outbox WHERE user_id = $1::uuid AND kind = 'password_reset'`, userID).Scan(&outboxCount, &canceledCount); err != nil {
		t.Fatal(err)
	}
	if outboxCount != 2 || canceledCount != 1 {
		t.Fatalf("replacement outbox rows = %d total, %d canceled; want 2, 1", outboxCount, canceledCount)
	}
	if err := store.PreflightPasswordReset(ctx, materialOne.Selector, materialOne.VerifierDigest); !errors.Is(err, application.ErrInvalidPasswordResetToken) {
		t.Fatalf("PreflightPasswordReset(old) error = %v", err)
	}
	if err := store.PreflightPasswordReset(ctx, materialTwo.Selector, materialTwo.VerifierDigest); err != nil {
		t.Fatalf("PreflightPasswordReset(current) error = %v", err)
	}

	const leaseOne = "00000000-0000-4000-8000-000000000011"
	job, err := store.ClaimMail(ctx, leaseOne, time.Minute)
	if err != nil || job == nil {
		t.Fatalf("ClaimMail(first) = %#v, %v", job, err)
	}
	if job.Kind != application.MailPasswordReset || !bytes.Equal(job.ResetSelector, materialTwo.Selector) || !bytes.Equal(job.VerifierDigest, materialTwo.VerifierDigest) || job.Attempts != 1 {
		t.Fatalf("claimed reset job = %#v", job)
	}
	const wrongLease = "00000000-0000-4000-8000-000000000012"
	if marked, err := store.MarkMailSent(ctx, job.ID, wrongLease); err != nil || marked {
		t.Fatalf("MarkMailSent(wrong lease) = %t, %v", marked, err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE auth_mail_outbox SET available_at = clock_timestamp() - interval '2 seconds', lease_expires_at = clock_timestamp() - interval '1 second' WHERE id = $1::uuid`, job.ID); err != nil {
		t.Fatal(err)
	}
	const leaseTwo = "00000000-0000-4000-8000-000000000013"
	reclaimed, err := store.ClaimMail(ctx, leaseTwo, time.Minute)
	if err != nil || reclaimed == nil || reclaimed.ID != job.ID || reclaimed.Attempts != 2 {
		t.Fatalf("ClaimMail(after lease expiry) = %#v, %v", reclaimed, err)
	}
	if retried, err := store.RetryMail(ctx, reclaimed.ID, reclaimed.LeaseToken, 10*time.Minute, "temporary"); err != nil || !retried {
		t.Fatalf("RetryMail() = %t, %v", retried, err)
	}
	if available, err := store.ClaimMail(ctx, "00000000-0000-4000-8000-000000000014", time.Minute); err != nil || available != nil {
		t.Fatalf("ClaimMail(before retry availability) = %#v, %v", available, err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE auth_mail_outbox SET available_at = clock_timestamp() - interval '1 second' WHERE id = $1::uuid`, reclaimed.ID); err != nil {
		t.Fatal(err)
	}
	const leaseThree = "00000000-0000-4000-8000-000000000015"
	retriedJob, err := store.ClaimMail(ctx, leaseThree, time.Minute)
	if err != nil || retriedJob == nil || retriedJob.ID != job.ID || retriedJob.Attempts != 3 {
		t.Fatalf("ClaimMail(after retry delay) = %#v, %v", retriedJob, err)
	}
	if dead, err := store.DeadLetterMail(ctx, retriedJob.ID, retriedJob.LeaseToken, "permanent"); err != nil || !dead {
		t.Fatalf("DeadLetterMail() = %t, %v", dead, err)
	}

	materialThree, err := domain.NewPasswordResetMaterial(key, bytes.Repeat([]byte{0x33}, domain.PasswordResetSelectorBytes))
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RequestPasswordReset(ctx, email, materialThree.Selector, materialThree.VerifierDigest, time.Hour, domain.LocaleEnglish); err != nil {
		t.Fatalf("RequestPasswordReset(second current) error = %v", err)
	}
	changedAt, err := store.CompletePasswordReset(ctx, materialThree.Selector, materialThree.VerifierDigest, "new-hash", domain.LocaleEnglish, 24*time.Hour)
	if err != nil {
		t.Fatalf("CompletePasswordReset() error = %v", err)
	}
	var authVersion int64
	var resetRows, pendingResetRows, notificationRows int
	if err := db.QueryRowContext(ctx, `SELECT auth_version FROM auth_users WHERE id = $1::uuid`, userID).Scan(&authVersion); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM auth_password_resets WHERE user_id = $1::uuid`, userID).Scan(&resetRows); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM auth_mail_outbox WHERE user_id = $1::uuid AND kind = 'password_reset' AND sent_at IS NULL AND canceled_at IS NULL AND dead_at IS NULL`, userID).Scan(&pendingResetRows); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM auth_mail_outbox WHERE user_id = $1::uuid AND kind = 'password_changed' AND created_at >= $2`, userID, changedAt.Add(-time.Second)).Scan(&notificationRows); err != nil {
		t.Fatal(err)
	}
	if authVersion != 2 || resetRows != 0 || pendingResetRows != 0 || notificationRows != 1 {
		t.Fatalf("completion state = auth_version %d, resets %d, pending reset mail %d, notices %d", authVersion, resetRows, pendingResetRows, notificationRows)
	}
	if err := store.PreflightPasswordReset(ctx, materialThree.Selector, materialThree.VerifierDigest); !errors.Is(err, application.ErrInvalidPasswordResetToken) {
		t.Fatalf("PreflightPasswordReset(replay) error = %v", err)
	}

	if _, err := db.ExecContext(ctx, `
		INSERT INTO auth_mail_outbox (kind, user_id, locale, expires_at, created_at, sent_at)
		SELECT 'password_changed', $1::uuid, 'en', clock_timestamp() + interval '1 hour', clock_timestamp() - interval '8 days', clock_timestamp() - interval '8 days'
		FROM generate_series(1, 150)`, userID); err != nil {
		t.Fatal(err)
	}
	if err := store.CleanupMail(ctx); err != nil {
		t.Fatalf("CleanupMail() error = %v", err)
	}
	var retainedAfterCleanup int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM auth_mail_outbox WHERE user_id = $1::uuid AND kind = 'password_changed' AND sent_at IS NOT NULL`, userID).Scan(&retainedAfterCleanup); err != nil {
		t.Fatal(err)
	}
	if retainedAfterCleanup != 50 {
		t.Fatalf("CleanupMail retained %d old rows, want 50 after one 100-row batch", retainedAfterCleanup)
	}

	if _, err := db.ExecContext(ctx, `
		INSERT INTO auth_mail_outbox (kind, user_id, locale, expires_at, created_at)
		SELECT 'password_changed', $1::uuid, 'en', clock_timestamp() - interval '1 hour', clock_timestamp() - interval '2 hours'
		FROM generate_series(1, 150)`, userID); err != nil {
		t.Fatal(err)
	}
	if err := store.SweepMail(ctx); err != nil {
		t.Fatalf("SweepMail() error = %v", err)
	}
	var canceledExpired int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM auth_mail_outbox WHERE user_id = $1::uuid AND kind = 'password_changed' AND expires_at < clock_timestamp() AND canceled_at IS NOT NULL`, userID).Scan(&canceledExpired); err != nil {
		t.Fatal(err)
	}
	if canceledExpired != 100 {
		t.Fatalf("SweepMail canceled %d expired rows, want one 100-row batch", canceledExpired)
	}

	if _, err := db.ExecContext(ctx, `
		INSERT INTO auth_mail_outbox (kind, user_id, locale, expires_at)
		SELECT 'password_changed', $1::uuid, 'en', clock_timestamp() + interval '1 hour'
		FROM generate_series(1, 4)`, userID); err != nil {
		t.Fatal(err)
	}
	const consumers = 4
	leases := []string{
		"00000000-0000-4000-8000-000000000021",
		"00000000-0000-4000-8000-000000000022",
		"00000000-0000-4000-8000-000000000023",
		"00000000-0000-4000-8000-000000000024",
	}
	claimedIDs := make(chan string, consumers)
	errorsFromClaims := make(chan error, consumers)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := range consumers {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			claimed, claimErr := store.ClaimMail(ctx, leases[index], time.Minute)
			if claimErr != nil {
				errorsFromClaims <- claimErr
				return
			}
			if claimed != nil {
				claimedIDs <- claimed.ID
				_, _ = store.MarkMailSent(ctx, claimed.ID, claimed.LeaseToken)
			}
		}(i)
	}
	close(start)
	wg.Wait()
	close(claimedIDs)
	close(errorsFromClaims)
	for claimErr := range errorsFromClaims {
		if claimErr != nil {
			t.Fatalf("concurrent ClaimMail() error = %v", claimErr)
		}
	}
	uniqueClaims := make(map[string]struct{}, consumers)
	for id := range claimedIDs {
		uniqueClaims[id] = struct{}{}
	}
	if len(uniqueClaims) != consumers {
		t.Fatalf("concurrent ClaimMail claimed %d unique rows, want %d", len(uniqueClaims), consumers)
	}
}

func TestStoreIntegrationRBACAndInvitationLifecycle(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not set")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
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

	setupDigest := sha256.Sum256([]byte("rbac setup token"))
	if complete, err := store.ReplaceCurrentToken(ctx, setupDigest[:], time.Hour); err != nil || complete {
		t.Fatalf("ReplaceCurrentToken() = %t, %v", complete, err)
	}
	name, _ := domain.NewName("RBAC Admin")
	email, _ := domain.NewEmail("rbac-admin@example.com")
	admin, err := store.Complete(ctx, setupDigest[:], name, email, "$argon2id$test")
	if err != nil {
		t.Fatalf("Complete() error = %v", err)
	}

	var superRoleID string
	if err := db.QueryRowContext(ctx, `SELECT id::text FROM auth_roles WHERE system_key = 'super_admin'`).Scan(&superRoleID); err != nil {
		t.Fatal(err)
	}
	principal, err := store.FindPrincipalByID(ctx, admin.ID)
	if err != nil || !principal.SuperAdmin || len(principal.Roles) != 1 {
		t.Fatalf("initial principal = %#v, %v", principal, err)
	}
	if got := principal.EffectivePermissions(domain.DefaultPermissionCatalog()); len(got) != 2 {
		t.Fatalf("initial effective permissions = %#v", got)
	}

	role, err := store.CreateRole(ctx, "Read Only", "", []domain.PermissionKey{domain.PermissionUsersRead})
	if err != nil {
		t.Fatalf("CreateRole() error = %v", err)
	}
	if role.Revision != 1 || len(role.Permissions) != 1 {
		t.Fatalf("created role = %#v", role)
	}
	assigned, err := store.ReplaceUserRoles(ctx, admin.ID, 1, []string{superRoleID, role.ID})
	if err != nil || assigned.AuthVersion != 2 || len(assigned.Roles) != 2 {
		t.Fatalf("ReplaceUserRoles(additive) = %#v, %v", assigned, err)
	}
	role, err = store.ReplaceRole(ctx, role.ID, role.Revision, "Read Only", "renamed only", []domain.PermissionKey{domain.PermissionUsersRead})
	if err != nil || role.Revision != 2 {
		t.Fatalf("ReplaceRole(metadata) = %#v, %v", role, err)
	}
	var unchangedVersion int64
	if err := db.QueryRowContext(ctx, `SELECT auth_version FROM auth_users WHERE id = $1::uuid`, admin.ID).Scan(&unchangedVersion); err != nil || unchangedVersion != 2 {
		t.Fatalf("metadata rename auth_version = %d, %v", unchangedVersion, err)
	}
	role, err = store.ReplaceRole(ctx, role.ID, role.Revision, "Read Only", "renamed only", []domain.PermissionKey{domain.PermissionRolesRead})
	if err != nil || role.Revision != 3 {
		t.Fatalf("ReplaceRole(grant) = %#v, %v", role, err)
	}
	if err := db.QueryRowContext(ctx, `SELECT auth_version FROM auth_users WHERE id = $1::uuid`, admin.ID).Scan(&unchangedVersion); err != nil || unchangedVersion != 3 {
		t.Fatalf("grant change auth_version = %d, %v", unchangedVersion, err)
	}
	if err := store.DeleteRole(ctx, role.ID); !errors.Is(err, application.ErrRoleInUse) {
		t.Fatalf("DeleteRole(assigned) = %v, want role in use", err)
	}

	key := bytes.Repeat([]byte{0x31}, 32)
	selector := bytes.Repeat([]byte{0x41}, 16)
	material, err := domain.NewInvitationMaterial(key, selector)
	if err != nil {
		t.Fatal(err)
	}
	invitation, err := store.CreateInvitation(ctx, admin.ID, "Invited Admin", "invited@example.com", domain.LocaleEnglish, []string{superRoleID, role.ID}, material.Selector, material.VerifierDigest, 2*time.Hour)
	if err != nil {
		t.Fatalf("CreateInvitation() error = %v", err)
	}
	if len(invitation.Roles) != 2 || invitation.Revision != 1 {
		t.Fatalf("created invitation = %#v", invitation)
	}
	listedRoles, err := store.ListRoles(ctx)
	if err != nil {
		t.Fatalf("ListRoles() error = %v", err)
	}
	var listedRole domain.Role
	for _, candidate := range listedRoles {
		if candidate.ID == role.ID {
			listedRole = candidate
			break
		}
	}
	if listedRole.ID == "" || listedRole.AssignmentCount != 2 {
		t.Fatalf("ListRoles() role reference count = %#v, want two user/invitation references", listedRole)
	}
	detailedRole, err := store.FindRole(ctx, role.ID)
	if err != nil || detailedRole.AssignmentCount != listedRole.AssignmentCount {
		t.Fatalf("FindRole() reference count = %#v, %v; list count = %d", detailedRole, err, listedRole.AssignmentCount)
	}
	duplicateSelector := bytes.Repeat([]byte{0x42}, 16)
	duplicateMaterial, _ := domain.NewInvitationMaterial(key, duplicateSelector)
	if _, err := store.CreateInvitation(ctx, admin.ID, "Invited Admin", "INVITED@example.com", domain.LocaleEnglish, []string{role.ID}, duplicateMaterial.Selector, duplicateMaterial.VerifierDigest, time.Hour); !errors.Is(err, application.ErrInvitationPending) {
		t.Fatalf("duplicate invitation = %v, want pending conflict", err)
	}
	job, err := store.ClaimMail(ctx, "00000000-0000-4000-8000-000000000031", time.Minute)
	if err != nil || job == nil || job.Kind != application.MailUserInvitation || job.InvitationID != invitation.ID || !bytes.Equal(job.InvitationSelector, selector) {
		t.Fatalf("ClaimMail(invitation) = %#v, %v", job, err)
	}

	if err := store.CompleteInvitation(ctx, selector, material.VerifierDigest, "$argon2id$invited"); err != nil {
		t.Fatalf("CompleteInvitation() error = %v", err)
	}
	if err := store.PreflightInvitation(ctx, selector, material.VerifierDigest); !errors.Is(err, application.ErrInvitationInvalid) {
		t.Fatalf("PreflightInvitation(replay) = %v", err)
	}
	var invitedID string
	if err := db.QueryRowContext(ctx, `SELECT id::text FROM auth_users WHERE email_canonical = 'invited@example.com'`).Scan(&invitedID); err != nil {
		t.Fatal(err)
	}
	invited, err := store.ReplaceUserRoles(ctx, invitedID, 1, []string{superRoleID})
	if err != nil || invited.AuthVersion != 2 {
		t.Fatalf("ReplaceUserRoles(invited) = %#v, %v", invited, err)
	}
	if _, err := store.ReplaceUserRoles(ctx, admin.ID, 3, []string{superRoleID}); err != nil {
		t.Fatalf("ReplaceUserRoles(admin cleanup) = %v", err)
	}
	if err := store.DeleteRole(ctx, role.ID); err != nil {
		t.Fatalf("DeleteRole(after reassignment) = %v", err)
	}
}
