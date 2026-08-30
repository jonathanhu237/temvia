package postgres

import (
	"context"
	"database/sql"

	"example.com/temvia/api/internal/auth/application"
	"example.com/temvia/api/internal/auth/domain"
)

func (s *Store) FindByCanonicalEmail(ctx context.Context, canonical string) (domain.Account, error) {
	var account domain.Account
	err := s.db.QueryRowContext(ctx, `SELECT id::text, name, email, password_hash, created_at FROM auth_users WHERE email_canonical = $1`, canonical).Scan(&account.User.ID, &account.User.Name, &account.User.Email, &account.PasswordHash, &account.User.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return domain.Account{}, application.ErrAccountNotFound
		}
		return domain.Account{}, err
	}
	return account, nil
}

func (s *Store) FindPublicByID(ctx context.Context, id string) (domain.User, error) {
	var user domain.User
	err := s.db.QueryRowContext(ctx, `SELECT id::text, name, email, created_at FROM auth_users WHERE id = $1::uuid`, id).Scan(&user.ID, &user.Name, &user.Email, &user.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return domain.User{}, application.ErrAccountNotFound
		}
		return domain.User{}, err
	}
	return user, nil
}
