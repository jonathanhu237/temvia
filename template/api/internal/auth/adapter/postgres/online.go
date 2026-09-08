package postgres

import (
	"context"
	"example.com/temvia/api/internal/auth/application"
	"example.com/temvia/api/internal/auth/domain"
)

func (s *Store) RevokeUserSessions(ctx context.Context, actorID, userID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var superRoleID string
	if err := tx.QueryRowContext(ctx, `SELECT id::text FROM auth_roles WHERE system_key = 'super_admin'`).Scan(&superRoleID); err != nil {
		return err
	}
	actorRoles, err := roleIDsForUserTx(ctx, tx, actorID)
	if err != nil {
		return err
	}
	if err := lockRoles(ctx, tx, append(actorRoles, superRoleID)); err != nil {
		return err
	}
	if err := lockUsersTx(ctx, tx, actorID, userID); err != nil {
		return err
	}
	actorSuper, permissions, err := effectivePermissionsTx(ctx, tx, actorID, superRoleID)
	if err != nil {
		return err
	}
	if !actorSuper && !permissions[domain.PermissionOnlineUsersWrite] {
		return application.ErrForbidden
	}
	// PostgreSQL is the revocation authority. Old Redis sessions are rejected
	// even if cleanup fails or an in-flight login creates an old-version session.
	result, err := tx.ExecContext(ctx, `UPDATE auth_users SET auth_version = auth_version + 1 WHERE id = $1::uuid`, userID)
	if err != nil {
		return err
	}
	if affected, err := result.RowsAffected(); err != nil {
		return err
	} else if affected != 1 {
		return application.ErrUserNotFound
	}
	return tx.Commit()
}
