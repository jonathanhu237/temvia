package postgres

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"strings"
	"time"

	"example.com/temvia/api/internal/auth/application"
	"example.com/temvia/api/internal/auth/domain"
)

func (s *Store) FindPrincipalByID(ctx context.Context, id string) (domain.Principal, error) {
	var principal domain.Principal
	var authVersion int64
	err := s.db.QueryRowContext(ctx, `SELECT id::text, name, email, created_at, auth_version FROM auth_users WHERE id = $1::uuid`, id).
		Scan(&principal.User.ID, &principal.User.Name, &principal.User.Email, &principal.User.CreatedAt, &authVersion)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.Principal{}, application.ErrAccountNotFound
		}
		return domain.Principal{}, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT r.id::text, COALESCE(r.system_key, ''), r.name, r.description, r.revision,
		       r.created_at, r.updated_at, COALESCE(rp.permission_key, '')
		FROM auth_user_roles AS ur
		JOIN auth_roles AS r ON r.id = ur.role_id
		LEFT JOIN auth_role_permissions AS rp ON rp.role_id = r.id
		WHERE ur.user_id = $1::uuid
		ORDER BY (r.system_key IS NULL), r.name_canonical, r.id, rp.permission_key`, id)
	if err != nil {
		return domain.Principal{}, err
	}
	defer rows.Close()
	roles := make(map[string]*domain.Role)
	for rows.Next() {
		var role domain.Role
		var permission string
		if err := rows.Scan(&role.ID, &role.SystemKey, &role.Name, &role.Description, &role.Revision, &role.CreatedAt, &role.UpdatedAt, &permission); err != nil {
			return domain.Principal{}, err
		}
		current := roles[role.ID]
		if current == nil {
			current = &role
			roles[role.ID] = current
		}
		if role.SystemKey == "super_admin" {
			principal.SuperAdmin = true
		}
		if permission != "" {
			current.Permissions = append(current.Permissions, domain.PermissionKey(permission))
		}
	}
	if err := rows.Err(); err != nil {
		return domain.Principal{}, err
	}
	for _, role := range roles {
		sort.Slice(role.Permissions, func(i, j int) bool { return role.Permissions[i] < role.Permissions[j] })
		principal.Roles = append(principal.Roles, *role)
		principal.Permissions = append(principal.Permissions, role.Permissions...)
	}
	sort.Slice(principal.Roles, func(i, j int) bool { return principal.Roles[i].Name < principal.Roles[j].Name })
	// The application expands the built-in role from the live permission
	// catalog. A persisted summary would therefore be incomplete whenever the
	// principal also has a custom role; omit it so the application can derive
	// authority exclusively from the normalized assignments.
	if principal.SuperAdmin {
		principal.Permissions = nil
	} else {
		principal.Permissions = uniquePermissionKeys(principal.Permissions)
	}
	_ = authVersion // auth_version is checked by Authentication before this projection.
	return principal, nil
}

func uniquePermissionKeys(keys []domain.PermissionKey) []domain.PermissionKey {
	seen := make(map[domain.PermissionKey]struct{}, len(keys))
	result := make([]domain.PermissionKey, 0, len(keys))
	for _, key := range keys {
		if _, ok := seen[key]; !ok {
			seen[key] = struct{}{}
			result = append(result, key)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
	return result
}

func (s *Store) ListRoles(ctx context.Context) ([]domain.Role, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT r.id::text, COALESCE(r.system_key, ''), r.name, r.description, r.revision,
		       r.created_at, r.updated_at, COALESCE(ur.assignment_count, 0), COALESCE(rp.permission_key, '')
		FROM auth_roles AS r
		LEFT JOIN (
			SELECT role_id, count(*) AS assignment_count
			FROM (
				SELECT role_id FROM auth_user_roles
				UNION ALL
				SELECT role_id FROM auth_invitation_roles
			) AS role_references
			GROUP BY role_id
		) AS ur ON ur.role_id = r.id
		LEFT JOIN auth_role_permissions AS rp ON rp.role_id = r.id
		ORDER BY (r.system_key IS NULL), r.name_canonical, r.id, rp.permission_key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	roles := map[string]*domain.Role{}
	for rows.Next() {
		var role domain.Role
		var permission string
		if err := rows.Scan(&role.ID, &role.SystemKey, &role.Name, &role.Description, &role.Revision, &role.CreatedAt, &role.UpdatedAt, &role.AssignmentCount, &permission); err != nil {
			return nil, err
		}
		current := roles[role.ID]
		if current == nil {
			current = &role
			roles[role.ID] = current
		}
		if permission != "" {
			current.Permissions = append(current.Permissions, domain.PermissionKey(permission))
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	result := make([]domain.Role, 0, len(roles))
	for _, role := range roles {
		role.Permissions = uniquePermissionKeys(role.Permissions)
		result = append(result, *role)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].SystemKey != "" && result[j].SystemKey == "" {
			return true
		}
		if result[i].SystemKey == "" && result[j].SystemKey != "" {
			return false
		}
		if result[i].Name != result[j].Name {
			return result[i].Name < result[j].Name
		}
		return result[i].ID < result[j].ID
	})
	return result, nil
}

func (s *Store) FindRole(ctx context.Context, id string) (domain.Role, error) {
	var role domain.Role
	var systemKey sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT r.id::text, r.system_key, r.name, r.description, r.revision, r.created_at, r.updated_at,
		       (SELECT count(*) FROM auth_user_roles WHERE role_id = r.id) + (SELECT count(*) FROM auth_invitation_roles WHERE role_id = r.id)
		FROM auth_roles AS r WHERE r.id = $1::uuid`, id).
		Scan(&role.ID, &systemKey, &role.Name, &role.Description, &role.Revision, &role.CreatedAt, &role.UpdatedAt, &role.AssignmentCount)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.Role{}, application.ErrRoleNotFound
		}
		return domain.Role{}, err
	}
	role.SystemKey = systemKey.String
	rows, err := s.db.QueryContext(ctx, `SELECT permission_key FROM auth_role_permissions WHERE role_id = $1::uuid ORDER BY permission_key`, id)
	if err != nil {
		return domain.Role{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return domain.Role{}, err
		}
		role.Permissions = append(role.Permissions, domain.PermissionKey(key))
	}
	if err := rows.Err(); err != nil {
		return domain.Role{}, err
	}
	return role, nil
}

func (s *Store) CreateRole(ctx context.Context, name, description string, permissions []domain.PermissionKey) (domain.Role, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Role{}, err
	}
	defer func() { _ = tx.Rollback() }()
	var role domain.Role
	canonical := domain.CanonicalRoleName(name)
	err = tx.QueryRowContext(ctx, `
		INSERT INTO auth_roles (name, name_canonical, description)
		VALUES ($1, $2, $3)
		RETURNING id::text, name, description, revision, created_at, updated_at`, name, canonical, description).
		Scan(&role.ID, &role.Name, &role.Description, &role.Revision, &role.CreatedAt, &role.UpdatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return domain.Role{}, application.ErrRoleAlreadyExists
		}
		return domain.Role{}, err
	}
	if err := insertRolePermissions(ctx, tx, role.ID, permissions); err != nil {
		return domain.Role{}, err
	}
	role.Permissions = append([]domain.PermissionKey(nil), permissions...)
	if err := tx.Commit(); err != nil {
		return domain.Role{}, err
	}
	return role, nil
}

func insertRolePermissions(ctx context.Context, tx *sql.Tx, roleID string, permissions []domain.PermissionKey) error {
	for _, permission := range permissions {
		if _, err := tx.ExecContext(ctx, `INSERT INTO auth_role_permissions (role_id, permission_key) VALUES ($1::uuid, $2)`, roleID, string(permission)); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) ReplaceRole(ctx context.Context, id string, revision int64, name, description string, permissions []domain.PermissionKey) (domain.Role, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Role{}, err
	}
	defer func() { _ = tx.Rollback() }()
	var systemKey sql.NullString
	var oldRevision int64
	if err := tx.QueryRowContext(ctx, `SELECT system_key, revision FROM auth_roles WHERE id = $1::uuid FOR UPDATE`, id).Scan(&systemKey, &oldRevision); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.Role{}, application.ErrRoleNotFound
		}
		return domain.Role{}, err
	}
	if systemKey.Valid {
		return domain.Role{}, application.ErrImmutableRole
	}
	if revision != oldRevision {
		return domain.Role{}, application.ErrStaleRevision
	}
	var oldPermissions []domain.PermissionKey
	rows, err := tx.QueryContext(ctx, `SELECT permission_key FROM auth_role_permissions WHERE role_id = $1::uuid ORDER BY permission_key`, id)
	if err != nil {
		return domain.Role{}, err
	}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			rows.Close()
			return domain.Role{}, err
		}
		oldPermissions = append(oldPermissions, domain.PermissionKey(key))
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return domain.Role{}, err
	}
	rows.Close()
	changed := !samePermissionSet(oldPermissions, permissions)
	canonical := domain.CanonicalRoleName(name)
	var role domain.Role
	if err := tx.QueryRowContext(ctx, `UPDATE auth_roles SET name = $2, name_canonical = $3, description = $4, revision = revision + 1, updated_at = clock_timestamp() WHERE id = $1::uuid RETURNING id::text, name, description, revision, created_at, updated_at`, id, name, canonical, description).
		Scan(&role.ID, &role.Name, &role.Description, &role.Revision, &role.CreatedAt, &role.UpdatedAt); err != nil {
		if isUniqueViolation(err) {
			return domain.Role{}, application.ErrRoleAlreadyExists
		}
		return domain.Role{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM auth_role_permissions WHERE role_id = $1::uuid`, id); err != nil {
		return domain.Role{}, err
	}
	if err := insertRolePermissions(ctx, tx, id, permissions); err != nil {
		return domain.Role{}, err
	}
	if changed {
		if _, err := tx.ExecContext(ctx, `UPDATE auth_users SET auth_version = auth_version + 1 WHERE id IN (SELECT user_id FROM auth_user_roles WHERE role_id = $1::uuid)`, id); err != nil {
			return domain.Role{}, err
		}
	}
	role.Permissions = append([]domain.PermissionKey(nil), permissions...)
	if err := tx.Commit(); err != nil {
		return domain.Role{}, err
	}
	return role, nil
}

func samePermissionSet(left, right []domain.PermissionKey) bool {
	return strings.Join(permissionStrings(uniquePermissionKeys(left)), "\x00") == strings.Join(permissionStrings(uniquePermissionKeys(right)), "\x00")
}

func permissionStrings(keys []domain.PermissionKey) []string {
	result := make([]string, len(keys))
	for i, key := range keys {
		result[i] = string(key)
	}
	return result
}

func (s *Store) DeleteRole(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var systemKey sql.NullString
	if err := tx.QueryRowContext(ctx, `SELECT system_key FROM auth_roles WHERE id = $1::uuid FOR UPDATE`, id).Scan(&systemKey); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return application.ErrRoleNotFound
		}
		return err
	}
	if systemKey.Valid {
		return application.ErrImmutableRole
	}
	var references int
	if err := tx.QueryRowContext(ctx, `SELECT (SELECT count(*) FROM auth_user_roles WHERE role_id = $1::uuid) + (SELECT count(*) FROM auth_invitation_roles WHERE role_id = $1::uuid)`, id).Scan(&references); err != nil {
		return err
	}
	if references > 0 {
		return application.ErrRoleInUse
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM auth_roles WHERE id = $1::uuid`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) ListUsers(ctx context.Context, cursor string, limit int) (application.UserPage, error) {
	if limit <= 0 {
		limit = 25
	}
	args := []any{}
	where := ""
	if cursor != "" {
		where = "WHERE u.id > $1::uuid"
		args = append(args, cursor)
	}
	args = append(args, limit+1)
	rows, err := s.db.QueryContext(ctx, `
		WITH selected_users AS (
			SELECT u.id, u.name, u.email, u.created_at, u.auth_version
			FROM auth_users AS u `+where+` ORDER BY u.id LIMIT $`+itoa(len(args))+`
		)
		SELECT u.id::text, u.name, u.email, u.created_at, u.auth_version,
		       COALESCE(r.id::text, ''), COALESCE(r.system_key, ''), COALESCE(r.name, ''), COALESCE(r.description, ''), COALESCE(r.revision, 0),
		       COALESCE(rp.permission_key, '')
		FROM selected_users AS u
		LEFT JOIN auth_user_roles AS ur ON ur.user_id = u.id
		LEFT JOIN auth_roles AS r ON r.id = ur.role_id
		LEFT JOIN auth_role_permissions AS rp ON rp.role_id = r.id
		ORDER BY u.id, (r.system_key IS NULL), r.name_canonical, r.id, rp.permission_key`, args...)
	if err != nil {
		return application.UserPage{}, err
	}
	defer rows.Close()
	users := map[string]*domain.AccessUser{}
	order := []string{}
	for rows.Next() {
		var user domain.AccessUser
		var role domain.Role
		var permission string
		if err := rows.Scan(&user.User.ID, &user.User.Name, &user.User.Email, &user.User.CreatedAt, &user.AuthVersion, &role.ID, &role.SystemKey, &role.Name, &role.Description, &role.Revision, &permission); err != nil {
			return application.UserPage{}, err
		}
		current := users[user.User.ID]
		if current == nil {
			current = &user
			users[user.User.ID] = current
			order = append(order, user.User.ID)
		}
		if role.ID == "" {
			continue
		}
		if len(current.Roles) == 0 || current.Roles[len(current.Roles)-1].ID != role.ID {
			current.Roles = append(current.Roles, role)
		}
		if permission != "" {
			index := len(current.Roles) - 1
			current.Roles[index].Permissions = append(current.Roles[index].Permissions, domain.PermissionKey(permission))
		}
	}
	if err := rows.Err(); err != nil {
		return application.UserPage{}, err
	}
	page := application.UserPage{}
	for _, id := range order {
		page.Items = append(page.Items, *users[id])
	}
	if len(page.Items) > limit {
		page.NextCursor = page.Items[limit-1].User.ID
		page.Items = page.Items[:limit]
	}
	return page, nil
}

// itoa is kept local to avoid pulling a formatting dependency into SQL paths.
func itoa(value int) string {
	if value == 1 {
		return "1"
	}
	if value == 2 {
		return "2"
	}
	if value == 3 {
		return "3"
	}
	if value == 4 {
		return "4"
	}
	if value == 5 {
		return "5"
	}
	if value == 6 {
		return "6"
	}
	if value == 7 {
		return "7"
	}
	if value == 8 {
		return "8"
	}
	if value == 9 {
		return "9"
	}
	return "10"
}

func (s *Store) ReplaceUserRoles(ctx context.Context, userID string, authVersion int64, roleIDs []string) (domain.AccessUser, error) {
	if len(roleIDs) == 0 {
		return domain.AccessUser{}, application.ErrInvalidRoleSet
	}
	seen := make(map[string]struct{}, len(roleIDs))
	for _, roleID := range roleIDs {
		if _, exists := seen[roleID]; exists {
			return domain.AccessUser{}, application.ErrInvalidRoleSet
		}
		seen[roleID] = struct{}{}
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.AccessUser{}, err
	}
	defer func() { _ = tx.Rollback() }()
	var superRoleID string
	if err := tx.QueryRowContext(ctx, `SELECT id::text FROM auth_roles WHERE system_key = 'super_admin'`).Scan(&superRoleID); err != nil {
		return domain.AccessUser{}, err
	}
	// Role updates, invitation acceptance, and assignment replacement all lock
	// role rows in one deterministic UUID order before locking an owning user or
	// invitation row. Include the built-in role even when it is not in the new
	// set because this transaction may remove it from the current assignment.
	lockedRoleIDs := make([]string, 0, len(roleIDs)+1)
	lockedRoleIDs = append(lockedRoleIDs, roleIDs...)
	lockedRoleIDs = append(lockedRoleIDs, superRoleID)
	sort.Strings(lockedRoleIDs)
	for index, roleID := range lockedRoleIDs {
		if index > 0 && roleID == lockedRoleIDs[index-1] {
			continue
		}
		var lockedID string
		if err := tx.QueryRowContext(ctx, `SELECT id::text FROM auth_roles WHERE id = $1::uuid FOR UPDATE`, roleID).Scan(&lockedID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.AccessUser{}, application.ErrRoleNotFound
			}
			return domain.AccessUser{}, err
		}
	}
	var currentVersion int64
	if err := tx.QueryRowContext(ctx, `SELECT auth_version FROM auth_users WHERE id = $1::uuid FOR UPDATE`, userID).Scan(&currentVersion); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.AccessUser{}, application.ErrUserNotFound
		}
		return domain.AccessUser{}, err
	}
	if currentVersion != authVersion {
		return domain.AccessUser{}, application.ErrStaleRevision
	}
	var currentSuper bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM auth_user_roles WHERE user_id = $1::uuid AND role_id = $2::uuid)`, userID, superRoleID).Scan(&currentSuper); err != nil {
		return domain.AccessUser{}, err
	}
	newHasSuper := false
	for _, roleID := range roleIDs {
		if roleID == superRoleID {
			newHasSuper = true
		}
	}
	if currentSuper && !newHasSuper {
		var holders int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM auth_user_roles WHERE role_id = $1::uuid`, superRoleID).Scan(&holders); err != nil {
			return domain.AccessUser{}, err
		}
		if holders <= 1 {
			return domain.AccessUser{}, application.ErrLastSuperAdmin
		}
	}
	var oldRoles []string
	rows, err := tx.QueryContext(ctx, `SELECT role_id::text FROM auth_user_roles WHERE user_id = $1::uuid`, userID)
	if err != nil {
		return domain.AccessUser{}, err
	}
	for rows.Next() {
		var roleID string
		if err := rows.Scan(&roleID); err != nil {
			rows.Close()
			return domain.AccessUser{}, err
		}
		oldRoles = append(oldRoles, roleID)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return domain.AccessUser{}, err
	}
	rows.Close()
	sort.Strings(oldRoles)
	newRoles := append([]string(nil), roleIDs...)
	sort.Strings(newRoles)
	changed := strings.Join(oldRoles, "\x00") != strings.Join(newRoles, "\x00")
	if _, err := tx.ExecContext(ctx, `DELETE FROM auth_user_roles WHERE user_id = $1::uuid`, userID); err != nil {
		return domain.AccessUser{}, err
	}
	for _, roleID := range roleIDs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO auth_user_roles (user_id, role_id) VALUES ($1::uuid, $2::uuid)`, userID, roleID); err != nil {
			return domain.AccessUser{}, err
		}
	}
	if changed {
		if _, err := tx.ExecContext(ctx, `UPDATE auth_users SET auth_version = auth_version + 1 WHERE id = $1::uuid`, userID); err != nil {
			return domain.AccessUser{}, err
		}
	}
	var user domain.AccessUser
	if err := tx.QueryRowContext(ctx, `SELECT id::text, name, email, created_at, auth_version FROM auth_users WHERE id = $1::uuid`, userID).Scan(&user.User.ID, &user.User.Name, &user.User.Email, &user.User.CreatedAt, &user.AuthVersion); err != nil {
		return domain.AccessUser{}, err
	}
	rows, err = tx.QueryContext(ctx, `SELECT r.id::text, COALESCE(r.system_key, ''), r.name, r.description, r.revision, COALESCE(rp.permission_key, '') FROM auth_user_roles ur JOIN auth_roles r ON r.id = ur.role_id LEFT JOIN auth_role_permissions rp ON rp.role_id = r.id WHERE ur.user_id = $1::uuid ORDER BY (r.system_key IS NULL), r.name_canonical, r.id, rp.permission_key`, userID)
	if err != nil {
		return domain.AccessUser{}, err
	}
	for rows.Next() {
		var role domain.Role
		var permission string
		if err := rows.Scan(&role.ID, &role.SystemKey, &role.Name, &role.Description, &role.Revision, &permission); err != nil {
			rows.Close()
			return domain.AccessUser{}, err
		}
		if len(user.Roles) == 0 || user.Roles[len(user.Roles)-1].ID != role.ID {
			user.Roles = append(user.Roles, role)
		}
		if permission != "" {
			index := len(user.Roles) - 1
			user.Roles[index].Permissions = append(user.Roles[index].Permissions, domain.PermissionKey(permission))
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return domain.AccessUser{}, err
	}
	rows.Close()
	if err := tx.Commit(); err != nil {
		return domain.AccessUser{}, err
	}
	return user, nil
}

func (s *Store) CreateInvitation(ctx context.Context, createdBy, name, email string, locale domain.Locale, roleIDs []string, selector, digest []byte, ttl time.Duration) (domain.Invitation, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Invitation{}, err
	}
	defer func() { _ = tx.Rollback() }()
	// The active-account and pending-invitation tables have independent unique
	// indexes. Serialize this email across both tables so a concurrent
	// invitation and activation cannot commit an active account alongside a
	// pending invitation for the same canonical address.
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended(lower($1), 0))`, email); err != nil {
		return domain.Invitation{}, err
	}
	var active bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM auth_users WHERE email_canonical = lower($1))`, email).Scan(&active); err != nil {
		return domain.Invitation{}, err
	}
	if active {
		return domain.Invitation{}, application.ErrEmailAlreadyRegistered
	}
	var pending bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM auth_user_invitations WHERE email_canonical = lower($1))`, email).Scan(&pending); err != nil {
		return domain.Invitation{}, err
	}
	if pending {
		return domain.Invitation{}, application.ErrInvitationPending
	}
	if err := lockRoles(ctx, tx, roleIDs); err != nil {
		return domain.Invitation{}, err
	}
	var invitation domain.Invitation
	err = tx.QueryRowContext(ctx, `
		INSERT INTO auth_user_invitations (name, email, email_canonical, selector, verifier_digest, locale, expires_at, created_by)
		VALUES ($1, $2, lower($2), $3, $4, $5, clock_timestamp() + ($6 * INTERVAL '1 second'), $7::uuid)
		RETURNING id::text, name, email, locale, expires_at, created_at, revision, created_by::text`, name, email, selector, digest, string(locale), ttl.Seconds(), createdBy).
		Scan(&invitation.ID, &invitation.Name, &invitation.Email, &invitation.Locale, &invitation.ExpiresAt, &invitation.CreatedAt, &invitation.Revision, &invitation.CreatedBy)
	if err != nil {
		if isUniqueViolation(err) {
			return domain.Invitation{}, application.ErrInvitationPending
		}
		return domain.Invitation{}, err
	}
	for _, roleID := range roleIDs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO auth_invitation_roles (invitation_id, role_id) VALUES ($1::uuid, $2::uuid)`, invitation.ID, roleID); err != nil {
			return domain.Invitation{}, err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO auth_mail_outbox (kind, invitation_id, reset_selector, locale, expires_at, created_at) VALUES ('user_invitation', $1::uuid, $2, $3, $4, $5)`, invitation.ID, selector, string(locale), invitation.ExpiresAt, invitation.CreatedAt); err != nil {
		return domain.Invitation{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.Invitation{}, err
	}
	return s.populateInvitationRoles(ctx, invitation)
}

// lockRoles serializes operations which may create or remove a role reference.
// All callers acquire role locks in UUID order before locking their owning row,
// which keeps role deletion, assignment replacement, and invitation creation
// on one lock order.
func lockRoles(ctx context.Context, tx *sql.Tx, roleIDs []string) error {
	ordered := append([]string(nil), roleIDs...)
	sort.Strings(ordered)
	for _, roleID := range ordered {
		var lockedID string
		if err := tx.QueryRowContext(ctx, `SELECT id::text FROM auth_roles WHERE id = $1::uuid FOR UPDATE`, roleID).Scan(&lockedID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return application.ErrRoleNotFound
			}
			return err
		}
	}
	return nil
}

func (s *Store) ListInvitations(ctx context.Context, cursor string, limit int) (application.InvitationPage, error) {
	if limit <= 0 {
		limit = 25
	}
	args := []any{}
	where := ""
	if cursor != "" {
		where = "WHERE i.id > $1::uuid"
		args = append(args, cursor)
	}
	args = append(args, limit+1)
	rows, err := s.db.QueryContext(ctx, `
		WITH selected_invitations AS (
			SELECT i.id, i.name, i.email, i.locale, i.expires_at, i.created_at, i.revision, i.created_by
			FROM auth_user_invitations AS i `+where+` ORDER BY i.id LIMIT $`+itoa(len(args))+`
		)
		SELECT i.id::text, i.name, i.email, i.locale, i.expires_at, i.created_at, i.revision, i.created_by::text,
		       COALESCE(r.id::text, ''), COALESCE(r.system_key, ''), COALESCE(r.name, ''), COALESCE(r.description, ''), COALESCE(r.revision, 0),
		       COALESCE(rp.permission_key, '')
		FROM selected_invitations AS i
		LEFT JOIN auth_invitation_roles AS ir ON ir.invitation_id = i.id
		LEFT JOIN auth_roles AS r ON r.id = ir.role_id
		LEFT JOIN auth_role_permissions AS rp ON rp.role_id = r.id
		ORDER BY i.id, (r.system_key IS NULL), r.name_canonical, r.id, rp.permission_key`, args...)
	if err != nil {
		return application.InvitationPage{}, err
	}
	defer rows.Close()
	invitations := map[string]*domain.Invitation{}
	order := []string{}
	for rows.Next() {
		var invitation domain.Invitation
		var role domain.Role
		var permission string
		if err := rows.Scan(&invitation.ID, &invitation.Name, &invitation.Email, &invitation.Locale, &invitation.ExpiresAt, &invitation.CreatedAt, &invitation.Revision, &invitation.CreatedBy, &role.ID, &role.SystemKey, &role.Name, &role.Description, &role.Revision, &permission); err != nil {
			return application.InvitationPage{}, err
		}
		current := invitations[invitation.ID]
		if current == nil {
			current = &invitation
			invitations[invitation.ID] = current
			order = append(order, invitation.ID)
		}
		if role.ID == "" {
			continue
		}
		if len(current.Roles) == 0 || current.Roles[len(current.Roles)-1].ID != role.ID {
			current.Roles = append(current.Roles, role)
		}
		if permission != "" {
			index := len(current.Roles) - 1
			current.Roles[index].Permissions = append(current.Roles[index].Permissions, domain.PermissionKey(permission))
		}
	}
	if err := rows.Err(); err != nil {
		return application.InvitationPage{}, err
	}
	page := application.InvitationPage{}
	for _, id := range order {
		page.Items = append(page.Items, *invitations[id])
	}
	if len(page.Items) > limit {
		page.NextCursor = page.Items[limit-1].ID
		page.Items = page.Items[:limit]
	}
	return page, nil
}

func (s *Store) populateInvitationRoles(ctx context.Context, invitation domain.Invitation) (domain.Invitation, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT r.id::text, COALESCE(r.system_key, ''), r.name, r.description, r.revision, COALESCE(rp.permission_key, '') FROM auth_invitation_roles ir JOIN auth_roles r ON r.id = ir.role_id LEFT JOIN auth_role_permissions rp ON rp.role_id = r.id WHERE ir.invitation_id = $1::uuid ORDER BY (r.system_key IS NULL), r.name_canonical, r.id, rp.permission_key`, invitation.ID)
	if err != nil {
		return domain.Invitation{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var role domain.Role
		var permission string
		if err := rows.Scan(&role.ID, &role.SystemKey, &role.Name, &role.Description, &role.Revision, &permission); err != nil {
			return domain.Invitation{}, err
		}
		if len(invitation.Roles) == 0 || invitation.Roles[len(invitation.Roles)-1].ID != role.ID {
			invitation.Roles = append(invitation.Roles, role)
		}
		if permission != "" {
			index := len(invitation.Roles) - 1
			invitation.Roles[index].Permissions = append(invitation.Roles[index].Permissions, domain.PermissionKey(permission))
		}
	}
	return invitation, rows.Err()
}

func (s *Store) ResendInvitation(ctx context.Context, id string, selector, digest []byte, ttl time.Duration) (domain.Invitation, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Invitation{}, err
	}
	defer func() { _ = tx.Rollback() }()
	var invitation domain.Invitation
	if err := tx.QueryRowContext(ctx, `SELECT id::text, name, email, locale, expires_at, created_at, revision, created_by::text FROM auth_user_invitations WHERE id = $1::uuid FOR UPDATE`, id).Scan(&invitation.ID, &invitation.Name, &invitation.Email, &invitation.Locale, &invitation.ExpiresAt, &invitation.CreatedAt, &invitation.Revision, &invitation.CreatedBy); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.Invitation{}, application.ErrInvitationNotFound
		}
		return domain.Invitation{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE auth_mail_outbox SET canceled_at = clock_timestamp(), lease_token = NULL, lease_expires_at = NULL, last_error_code = 'superseded' WHERE invitation_id = $1::uuid AND sent_at IS NULL AND canceled_at IS NULL AND dead_at IS NULL`, id); err != nil {
		return domain.Invitation{}, err
	}
	if err := tx.QueryRowContext(ctx, `UPDATE auth_user_invitations SET selector = $2, verifier_digest = $3, expires_at = clock_timestamp() + ($4 * INTERVAL '1 second'), revision = revision + 1, updated_at = clock_timestamp() WHERE id = $1::uuid RETURNING expires_at, updated_at, revision`, id, selector, digest, ttl.Seconds()).Scan(&invitation.ExpiresAt, &invitation.UpdatedAt, &invitation.Revision); err != nil {
		return domain.Invitation{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO auth_mail_outbox (kind, invitation_id, reset_selector, locale, expires_at, created_at) VALUES ('user_invitation', $1::uuid, $2, $3, $4, clock_timestamp())`, id, selector, string(invitation.Locale), invitation.ExpiresAt); err != nil {
		return domain.Invitation{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.Invitation{}, err
	}
	return s.populateInvitationRoles(ctx, invitation)
}

func (s *Store) RevokeInvitation(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(ctx, `DELETE FROM auth_user_invitations WHERE id = $1::uuid`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return application.ErrInvitationNotFound
	}
	return tx.Commit()
}

func (s *Store) PreflightInvitation(ctx context.Context, selector, digest []byte) error {
	var stored []byte
	var valid bool
	err := s.db.QueryRowContext(ctx, `SELECT verifier_digest, expires_at > clock_timestamp() FROM auth_user_invitations WHERE selector = $1`, selector).Scan(&stored, &valid)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return application.ErrInvitationInvalid
		}
		return err
	}
	if !valid || !equalDigest(stored, digest) {
		return application.ErrInvitationInvalid
	}
	return nil
}

func (s *Store) CompleteInvitation(ctx context.Context, selector, digest []byte, passwordHash string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var invitationID, name, email, canonical string
	var stored []byte
	var valid bool
	if err := tx.QueryRowContext(ctx, `SELECT id::text, name, email, email_canonical FROM auth_user_invitations WHERE selector = $1`, selector).Scan(&invitationID, &name, &email, &canonical); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return application.ErrInvitationInvalid
		}
		return err
	}
	// Match CreateInvitation's transaction-level email lock before checking
	// the invitation and creating the activated account. This closes the
	// cross-table uniqueness race without storing a second email index.
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, canonical); err != nil {
		return err
	}
	roleRows, err := tx.QueryContext(ctx, `SELECT role_id::text FROM auth_invitation_roles WHERE invitation_id = $1::uuid`, invitationID)
	if err != nil {
		return err
	}
	var roleIDs []string
	for roleRows.Next() {
		var roleID string
		if err := roleRows.Scan(&roleID); err != nil {
			roleRows.Close()
			return err
		}
		roleIDs = append(roleIDs, roleID)
	}
	if err := roleRows.Err(); err != nil {
		roleRows.Close()
		return err
	}
	roleRows.Close()
	if err := lockRoles(ctx, tx, roleIDs); err != nil {
		return err
	}
	if err := tx.QueryRowContext(ctx, `SELECT verifier_digest, expires_at > clock_timestamp() FROM auth_user_invitations WHERE id = $1::uuid FOR UPDATE`, invitationID).Scan(&stored, &valid); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return application.ErrInvitationInvalid
		}
		return err
	}
	if !valid || !equalDigest(stored, digest) {
		return application.ErrInvitationInvalid
	}
	var userID string
	if err := tx.QueryRowContext(ctx, `INSERT INTO auth_users (name, email, email_canonical, password_hash) VALUES ($1, $2, $3, $4) RETURNING id::text`, name, email, canonical, passwordHash).Scan(&userID); err != nil {
		if isUniqueViolation(err) {
			return application.ErrInvitationInvalid
		}
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO auth_user_roles (user_id, role_id) SELECT $1::uuid, role_id FROM auth_invitation_roles WHERE invitation_id = $2::uuid`, userID, invitationID); err != nil {
		return err
	}
	var assigned int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM auth_user_roles WHERE user_id = $1::uuid`, userID).Scan(&assigned); err != nil {
		return err
	}
	if assigned == 0 {
		return application.ErrInvitationInvalid
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM auth_user_invitations WHERE id = $1::uuid`, invitationID); err != nil {
		return err
	}
	return tx.Commit()
}
