package postgres

import (
	"context"
	"database/sql"
	"errors"

	"example.com/temvia/api/internal/auth/application"
)

func (s *Store) GetEmailSettings(ctx context.Context) (application.EmailSettingsRecord, error) {
	var record application.EmailSettingsRecord
	err := s.db.QueryRowContext(ctx, `
		SELECT smtp_host, smtp_port, smtp_security, smtp_username,
		       smtp_password_ciphertext, from_address, from_name, default_locale,
		       revision, updated_at
		FROM auth_email_settings WHERE singleton = true`).Scan(
		&record.Host, &record.Port, &record.Security, &record.Username,
		&record.PasswordCiphertext, &record.FromAddress, &record.FromName,
		&record.DefaultLocale, &record.Revision, &record.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return application.EmailSettingsRecord{}, application.ErrMailNotConfigured
	}
	return record, err
}

func (s *Store) SaveEmailSettings(ctx context.Context, expectedRevision int64, record application.EmailSettingsRecord) (application.EmailSettingsRecord, error) {
	var saved application.EmailSettingsRecord
	if expectedRevision == 0 {
		err := s.db.QueryRowContext(ctx, `
			INSERT INTO auth_email_settings
				(singleton, smtp_host, smtp_port, smtp_security, smtp_username, smtp_password_ciphertext, from_address, from_name, default_locale, revision)
			VALUES (true, $1, $2, $3, $4, $5, $6, $7, $8, 1)
			ON CONFLICT (singleton) DO NOTHING
			RETURNING smtp_host, smtp_port, smtp_security, smtp_username, smtp_password_ciphertext, from_address, from_name, default_locale, revision, updated_at`,
			record.Host, record.Port, record.Security, record.Username, record.PasswordCiphertext, record.FromAddress, record.FromName, string(record.DefaultLocale)).Scan(
			&saved.Host, &saved.Port, &saved.Security, &saved.Username, &saved.PasswordCiphertext, &saved.FromAddress, &saved.FromName, &saved.DefaultLocale, &saved.Revision, &saved.UpdatedAt)
		if errors.Is(err, sql.ErrNoRows) {
			return application.EmailSettingsRecord{}, application.ErrStaleRevision
		}
		if err != nil {
			return application.EmailSettingsRecord{}, err
		}
		return saved, nil
	}
	err := s.db.QueryRowContext(ctx, `
		UPDATE auth_email_settings
		SET smtp_host = $1, smtp_port = $2, smtp_security = $3, smtp_username = $4,
		    smtp_password_ciphertext = $5, from_address = $6, from_name = $7,
		    default_locale = $8, revision = revision + 1, updated_at = clock_timestamp()
		WHERE singleton = true AND revision = $9
		RETURNING smtp_host, smtp_port, smtp_security, smtp_username, smtp_password_ciphertext, from_address, from_name, default_locale, revision, updated_at`,
		record.Host, record.Port, record.Security, record.Username, record.PasswordCiphertext, record.FromAddress, record.FromName, string(record.DefaultLocale), expectedRevision).Scan(
		&saved.Host, &saved.Port, &saved.Security, &saved.Username, &saved.PasswordCiphertext, &saved.FromAddress, &saved.FromName, &saved.DefaultLocale, &saved.Revision, &saved.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return application.EmailSettingsRecord{}, application.ErrStaleRevision
	}
	return saved, err
}

var _ application.EmailSettingsStore = (*Store)(nil)
