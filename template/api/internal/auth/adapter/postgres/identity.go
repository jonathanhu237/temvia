package postgres

import (
	"context"
	"database/sql"
	"errors"

	"example.com/temvia/api/internal/auth/application"
)

func (s *Store) GetSystemIdentity(ctx context.Context) (application.SystemIdentityRecord, error) {
	var record application.SystemIdentityRecord
	var english, mediaType sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT system_name, english_system_name, icon_media_type, icon_bytes, revision, updated_at
		FROM auth_system_identity WHERE singleton = true`).Scan(
		&record.SystemName, &english, &mediaType, &record.IconBytes, &record.Revision, &record.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return application.SystemIdentityRecord{}, application.ErrSystemIdentityNotConfigured
	}
	if english.Valid {
		record.EnglishSystemName = english.String
	}
	if mediaType.Valid {
		record.IconMediaType = mediaType.String
	}
	return record, err
}

func (s *Store) SaveSystemIdentity(ctx context.Context, expectedRevision int64, record application.SystemIdentityRecord) (application.SystemIdentityRecord, error) {
	var saved application.SystemIdentityRecord
	var english, mediaType sql.NullString
	if expectedRevision == 0 {
		err := s.db.QueryRowContext(ctx, `
			INSERT INTO auth_system_identity
				(singleton, system_name, english_system_name, icon_media_type, icon_bytes, revision)
			VALUES (true, $1, $2, $3, $4, 1)
			ON CONFLICT (singleton) DO NOTHING
			RETURNING system_name, english_system_name, icon_media_type, icon_bytes, revision, updated_at`,
			record.SystemName, record.EnglishSystemName, record.IconMediaType, record.IconBytes).Scan(
			&saved.SystemName, &english, &mediaType, &saved.IconBytes, &saved.Revision, &saved.UpdatedAt)
		if errors.Is(err, sql.ErrNoRows) {
			return application.SystemIdentityRecord{}, application.ErrStaleRevision
		}
		if err != nil {
			return application.SystemIdentityRecord{}, err
		}
		if english.Valid {
			saved.EnglishSystemName = english.String
		}
		if mediaType.Valid {
			saved.IconMediaType = mediaType.String
		}
		return saved, nil
	}
	err := s.db.QueryRowContext(ctx, `
		UPDATE auth_system_identity
		SET system_name = $1, english_system_name = $2, icon_media_type = $3, icon_bytes = $4,
			revision = revision + 1, updated_at = clock_timestamp()
		WHERE singleton = true AND revision = $5
		RETURNING system_name, english_system_name, icon_media_type, icon_bytes, revision, updated_at`,
		record.SystemName, record.EnglishSystemName, record.IconMediaType, record.IconBytes, expectedRevision).Scan(
		&saved.SystemName, &english, &mediaType, &saved.IconBytes, &saved.Revision, &saved.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return application.SystemIdentityRecord{}, application.ErrStaleRevision
	}
	if english.Valid {
		saved.EnglishSystemName = english.String
	}
	if mediaType.Valid {
		saved.IconMediaType = mediaType.String
	}
	return saved, err
}

var _ application.SystemIdentityStore = (*Store)(nil)
