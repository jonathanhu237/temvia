package application

import (
	"context"
	"errors"
	"sort"
	"time"

	"example.com/temvia/api/internal/auth/domain"
)

type RolePage struct {
	Items   []domain.Role
	Catalog []domain.PermissionDefinition
}

type UserPage struct {
	Items      []domain.AccessUser
	NextCursor string
}

type InvitationPage struct {
	Items      []domain.Invitation
	NextCursor string
}

type RoleMutationInput struct {
	Name        string
	Description string
	Permissions []domain.PermissionKey
	Revision    int64
}

type AssignmentInput struct {
	RoleIDs     []string
	AuthVersion int64
}

type InvitationInput struct {
	Name    string
	Email   string
	Locale  string
	RoleIDs []string
}

// AccessStore contains state-changing operations for the auth capability. A
// concrete PostgreSQL adapter implements this alongside the authentication and
// mail-outbox ports, while the application layer only sees domain values.
type AccessStore interface {
	ListRoles(context.Context) ([]domain.Role, error)
	FindRole(context.Context, string) (domain.Role, error)
	CreateRole(context.Context, string, string, []domain.PermissionKey) (domain.Role, error)
	ReplaceRole(context.Context, string, int64, string, string, []domain.PermissionKey) (domain.Role, error)
	DeleteRole(context.Context, string) error
	ListUsers(context.Context, string, int) (UserPage, error)
	ReplaceUserRoles(context.Context, string, int64, []string) (domain.AccessUser, error)
	CreateInvitation(context.Context, string, string, string, domain.Locale, []string, []byte, []byte, time.Duration) (domain.Invitation, error)
	ListInvitations(context.Context, string, int) (InvitationPage, error)
	ResendInvitation(context.Context, string, []byte, []byte, time.Duration) (domain.Invitation, error)
	RevokeInvitation(context.Context, string) error
	PreflightInvitation(context.Context, []byte, []byte) error
	CompleteInvitation(context.Context, []byte, []byte, string) error
}

type AccessManagement struct {
	store         AccessStore
	principals    PrincipalStore
	catalog       domain.PermissionCatalog
	invitationKey []byte
	random        RandomSource
	invitationTTL time.Duration
}

func NewAccessManagement(store AccessStore, principals PrincipalStore, catalog domain.PermissionCatalog) *AccessManagement {
	if len(catalog.Definitions()) == 0 {
		catalog = domain.DefaultPermissionCatalog()
	}
	return &AccessManagement{store: store, principals: principals, catalog: catalog}
}

func NewAccessManagementWithInvitations(store AccessStore, principals PrincipalStore, catalog domain.PermissionCatalog, key []byte, random RandomSource, ttl time.Duration) *AccessManagement {
	manager := NewAccessManagement(store, principals, catalog)
	manager.invitationKey = append([]byte(nil), key...)
	manager.random = random
	manager.invitationTTL = ttl
	return manager
}

func (m *AccessManagement) principal(ctx context.Context, actorID string) (domain.Principal, error) {
	if m.principals == nil || actorID == "" {
		return domain.Principal{}, ErrDependencyUnavailable
	}
	p, err := m.principals.FindPrincipalByID(ctx, actorID)
	if err != nil {
		if errors.Is(err, ErrAccountNotFound) {
			return domain.Principal{}, ErrUnauthenticated
		}
		return domain.Principal{}, dependencyError(err)
	}
	if err := ensurePrincipalIdentity(actorID, p); err != nil {
		return domain.Principal{}, err
	}
	return normalizePrincipal(m.catalog, p)
}

func (m *AccessManagement) require(ctx context.Context, actorID string, permission domain.PermissionKey) error {
	if !m.catalog.Has(permission) {
		// Routes must only authorize against the live, code-owned catalog. This
		// keeps an accidentally persisted/unknown grant from becoming an
		// implicit capability.
		return ErrForbidden
	}
	p, err := m.principal(ctx, actorID)
	if err != nil {
		return err
	}
	if !p.Has(permission) {
		return ErrForbidden
	}
	return nil
}

func (m *AccessManagement) requireSuper(ctx context.Context, actorID string) error {
	p, err := m.principal(ctx, actorID)
	if err != nil {
		return err
	}
	if !p.SuperAdmin {
		return ErrForbidden
	}
	return nil
}

func (m *AccessManagement) Roles(ctx context.Context, actorID string) (RolePage, error) {
	if err := m.require(ctx, actorID, domain.PermissionRolesRead); err != nil {
		return RolePage{}, err
	}
	roles, err := m.store.ListRoles(ctx)
	if err != nil {
		return RolePage{}, dependencyError(err)
	}
	for i := range roles {
		roles[i], err = normalizeRole(m.catalog, roles[i])
		if err != nil {
			return RolePage{}, err
		}
	}
	return RolePage{Items: roles, Catalog: m.catalog.Definitions()}, nil
}

func (m *AccessManagement) Role(ctx context.Context, actorID, roleID string) (domain.Role, error) {
	if err := m.require(ctx, actorID, domain.PermissionRolesRead); err != nil {
		return domain.Role{}, err
	}
	role, err := m.store.FindRole(ctx, roleID)
	if err != nil {
		return domain.Role{}, normalizeAccessError(err)
	}
	role, err = normalizeRole(m.catalog, role)
	if err != nil {
		return domain.Role{}, err
	}
	return role, nil
}

func (m *AccessManagement) CreateRole(ctx context.Context, actorID string, input RoleMutationInput) (domain.Role, error) {
	if err := m.requireSuper(ctx, actorID); err != nil {
		return domain.Role{}, err
	}
	name, description, permissions, err := validateRoleInput(m.catalog, input)
	if err != nil {
		return domain.Role{}, err
	}
	role, err := m.store.CreateRole(ctx, name, description, permissions)
	if err != nil {
		return domain.Role{}, normalizeAccessError(err)
	}
	return role, nil
}

func (m *AccessManagement) ReplaceRole(ctx context.Context, actorID, roleID string, input RoleMutationInput) (domain.Role, error) {
	if err := m.requireSuper(ctx, actorID); err != nil {
		return domain.Role{}, err
	}
	name, description, permissions, err := validateRoleInput(m.catalog, input)
	if err != nil {
		return domain.Role{}, err
	}
	role, err := m.store.ReplaceRole(ctx, roleID, input.Revision, name, description, permissions)
	if err != nil {
		return domain.Role{}, normalizeAccessError(err)
	}
	return role, nil
}

func (m *AccessManagement) DeleteRole(ctx context.Context, actorID, roleID string) error {
	if err := m.requireSuper(ctx, actorID); err != nil {
		return err
	}
	if err := m.store.DeleteRole(ctx, roleID); err != nil {
		return normalizeAccessError(err)
	}
	return nil
}

func (m *AccessManagement) Users(ctx context.Context, actorID, cursor string, limit int) (UserPage, error) {
	if err := m.require(ctx, actorID, domain.PermissionUsersRead); err != nil {
		return UserPage{}, err
	}
	if err := validatePage(cursor, limit); err != nil {
		return UserPage{}, err
	}
	page, err := m.store.ListUsers(ctx, cursor, limit)
	if err != nil {
		return UserPage{}, dependencyError(err)
	}
	for i := range page.Items {
		if len(page.Items[i].Roles) == 0 {
			return UserPage{}, ErrDependencyUnavailable
		}
		for j := range page.Items[i].Roles {
			role, roleErr := normalizeRole(m.catalog, page.Items[i].Roles[j])
			if roleErr != nil {
				return UserPage{}, roleErr
			}
			page.Items[i].Roles[j] = role
		}
	}
	return page, nil
}

func (m *AccessManagement) ReplaceUserRoles(ctx context.Context, actorID, userID string, input AssignmentInput) (domain.AccessUser, error) {
	if err := m.requireSuper(ctx, actorID); err != nil {
		return domain.AccessUser{}, err
	}
	if err := validateRoleIDs(input.RoleIDs); err != nil {
		return domain.AccessUser{}, err
	}
	user, err := m.store.ReplaceUserRoles(ctx, userID, input.AuthVersion, input.RoleIDs)
	if err != nil {
		return domain.AccessUser{}, normalizeAccessError(err)
	}
	return normalizeAccessUser(m.catalog, user)
}

func (m *AccessManagement) CreateInvitation(ctx context.Context, actorID string, input InvitationInput) (domain.Invitation, error) {
	if err := m.requireSuper(ctx, actorID); err != nil {
		return domain.Invitation{}, err
	}
	if m.random == nil || len(m.invitationKey) != 32 || m.invitationTTL <= 0 {
		return domain.Invitation{}, ErrDependencyUnavailable
	}
	name, err := domain.NewName(input.Name)
	if err != nil {
		return domain.Invitation{}, err
	}
	email, err := domain.NewEmail(input.Email)
	if err != nil {
		return domain.Invitation{}, err
	}
	locale, err := parseLocale(input.Locale)
	if err != nil {
		return domain.Invitation{}, err
	}
	if err := validateRoleIDs(input.RoleIDs); err != nil {
		return domain.Invitation{}, err
	}
	selector := make([]byte, 16)
	if err := m.random.Read(selector); err != nil {
		return domain.Invitation{}, dependencyError(err)
	}
	material, err := domain.NewInvitationMaterial(m.invitationKey, selector)
	if err != nil {
		return domain.Invitation{}, dependencyError(err)
	}
	invitation, err := m.store.CreateInvitation(ctx, actorID, string(name), email.Display, locale, input.RoleIDs, material.Selector, material.VerifierDigest, m.invitationTTL)
	if err != nil {
		return domain.Invitation{}, normalizeAccessError(err)
	}
	return normalizeInvitation(m.catalog, invitation)
}

func (m *AccessManagement) Invitations(ctx context.Context, actorID, cursor string, limit int) (InvitationPage, error) {
	if err := m.requireSuper(ctx, actorID); err != nil {
		return InvitationPage{}, err
	}
	if err := validatePage(cursor, limit); err != nil {
		return InvitationPage{}, err
	}
	page, err := m.store.ListInvitations(ctx, cursor, limit)
	if err != nil {
		return InvitationPage{}, dependencyError(err)
	}
	for i := range page.Items {
		if len(page.Items[i].Roles) == 0 {
			return InvitationPage{}, ErrDependencyUnavailable
		}
		for j := range page.Items[i].Roles {
			role, roleErr := normalizeRole(m.catalog, page.Items[i].Roles[j])
			if roleErr != nil {
				return InvitationPage{}, roleErr
			}
			page.Items[i].Roles[j] = role
		}
	}
	return page, nil
}

func (m *AccessManagement) ResendInvitation(ctx context.Context, actorID, invitationID string) (domain.Invitation, error) {
	if err := m.requireSuper(ctx, actorID); err != nil {
		return domain.Invitation{}, err
	}
	if m.random == nil || len(m.invitationKey) != 32 || m.invitationTTL <= 0 {
		return domain.Invitation{}, ErrDependencyUnavailable
	}
	selector := make([]byte, 16)
	if err := m.random.Read(selector); err != nil {
		return domain.Invitation{}, dependencyError(err)
	}
	material, err := domain.NewInvitationMaterial(m.invitationKey, selector)
	if err != nil {
		return domain.Invitation{}, dependencyError(err)
	}
	invitation, err := m.store.ResendInvitation(ctx, invitationID, material.Selector, material.VerifierDigest, m.invitationTTL)
	if err != nil {
		return domain.Invitation{}, normalizeAccessError(err)
	}
	return normalizeInvitation(m.catalog, invitation)
}

func (m *AccessManagement) RevokeInvitation(ctx context.Context, actorID, invitationID string) error {
	if err := m.requireSuper(ctx, actorID); err != nil {
		return err
	}
	if err := m.store.RevokeInvitation(ctx, invitationID); err != nil {
		return normalizeAccessError(err)
	}
	return nil
}

type InvitationAcceptance struct {
	store  AccessStore
	hasher PasswordHasher
	key    []byte
}

func NewInvitationAcceptance(store AccessStore, hasher PasswordHasher, key []byte) *InvitationAcceptance {
	return &InvitationAcceptance{store: store, hasher: hasher, key: append([]byte(nil), key...)}
}

func (a *InvitationAcceptance) Complete(ctx context.Context, token, password string) error {
	selector, digest, ok := domain.ParseInvitationToken(token)
	if !ok {
		return ErrInvitationInvalid
	}
	if a.store == nil || a.hasher == nil || len(a.key) != 32 {
		return ErrDependencyUnavailable
	}
	if err := a.store.PreflightInvitation(ctx, selector, digest); err != nil {
		if errors.Is(err, ErrInvitationInvalid) {
			return ErrInvitationInvalid
		}
		return dependencyError(err)
	}
	value, err := domain.NewPassword(password)
	if err != nil {
		return err
	}
	hash, err := a.hasher.Hash(ctx, string(value))
	if err != nil {
		if errors.Is(err, ErrPasswordHashBusy) {
			return ErrDependencyUnavailable
		}
		return dependencyError(err)
	}
	if err := a.store.CompleteInvitation(ctx, selector, digest, hash); err != nil {
		if errors.Is(err, ErrInvitationInvalid) || errors.Is(err, ErrEmailAlreadyRegistered) {
			return ErrInvitationInvalid
		}
		return dependencyError(err)
	}
	return nil
}

func validateRoleInput(catalog domain.PermissionCatalog, input RoleMutationInput) (string, string, []domain.PermissionKey, error) {
	name, err := domain.NewName(input.Name)
	if err != nil {
		if validation, ok := err.(*domain.ValidationErrors); ok {
			validation.Items[0].Field = "name"
		}
		return "", "", nil, err
	}
	description, err := validateDescription(input.Description)
	if err != nil {
		return "", "", nil, err
	}
	permissions, err := catalog.Validate(input.Permissions)
	if err != nil {
		return "", "", nil, err
	}
	if input.Revision < 0 {
		return "", "", nil, &domain.ValidationErrors{Items: []domain.FieldError{{Field: "revision", Code: "invalid_revision"}}}
	}
	return string(name), description, permissions, nil
}

func validateDescription(value string) (string, error) {
	for _, r := range value {
		if r == '\n' || r == '\r' || r == '\t' || r < 0x20 || r == '\u2028' || r == '\u2029' {
			return "", &domain.ValidationErrors{Items: []domain.FieldError{{Field: "description", Code: "invalid_description"}}}
		}
	}
	if len([]rune(value)) > 500 {
		return "", &domain.ValidationErrors{Items: []domain.FieldError{{Field: "description", Code: "invalid_description"}}}
	}
	return value, nil
}

func validateRoleIDs(ids []string) error {
	if len(ids) == 0 {
		return ErrInvalidRoleSet
	}
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if !domain.IsCanonicalUUID(id) {
			return &domain.ValidationErrors{Items: []domain.FieldError{{Field: "roleIds", Code: "invalid_role"}}}
		}
		if _, ok := seen[id]; ok {
			return &domain.ValidationErrors{Items: []domain.FieldError{{Field: "roleIds", Code: "duplicate_role"}}}
		}
		seen[id] = struct{}{}
	}
	return nil
}

func validatePage(cursor string, limit int) error {
	if limit == 0 {
		limit = 25
	}
	if limit < 1 || limit > 100 {
		return &domain.ValidationErrors{Items: []domain.FieldError{{Field: "limit", Code: "invalid_limit"}}}
	}
	if cursor != "" && !domain.IsCanonicalUUID(cursor) {
		return &domain.ValidationErrors{Items: []domain.FieldError{{Field: "cursor", Code: "invalid_cursor"}}}
	}
	return nil
}

func normalizeAccessError(err error) error {
	if err == nil {
		return nil
	}
	for _, known := range []error{ErrRoleNotFound, ErrRoleAlreadyExists, ErrUserNotFound, ErrInvitationNotFound, ErrRoleInUse, ErrImmutableRole, ErrLastSuperAdmin, ErrStaleRevision, ErrInvalidRoleSet, ErrInvitationPending, ErrInvitationInvalid, ErrEmailAlreadyRegistered, ErrForbidden, ErrDependencyUnavailable} {
		if errors.Is(err, known) {
			return err
		}
	}
	return dependencyError(err)
}

func (m *AccessManagement) knownPermissions(keys []domain.PermissionKey) bool {
	if len(keys) == 0 {
		return false
	}
	for _, key := range keys {
		if !m.catalog.Has(key) {
			return false
		}
	}
	return true
}

// normalizeRole is the single boundary between persisted role projections and
// authorization. The database deliberately does not copy the live catalog
// into the built-in role, so that role is expanded here. Custom role data must
// be non-empty and entirely known to the current process before it can be
// returned or used for authorization.
func normalizeRole(catalog domain.PermissionCatalog, role domain.Role) (domain.Role, error) {
	if role.IsSystem() {
		if role.SystemKey != "super_admin" {
			return domain.Role{}, ErrDependencyUnavailable
		}
		role.Permissions = catalog.Keys()
		return role, nil
	}
	if len(role.Permissions) == 0 {
		return domain.Role{}, ErrDependencyUnavailable
	}
	seen := make(map[domain.PermissionKey]struct{}, len(role.Permissions))
	permissions := make([]domain.PermissionKey, 0, len(role.Permissions))
	for _, permission := range role.Permissions {
		if !catalog.Has(permission) {
			return domain.Role{}, ErrDependencyUnavailable
		}
		if _, exists := seen[permission]; exists {
			continue
		}
		seen[permission] = struct{}{}
		permissions = append(permissions, permission)
	}
	sort.Slice(permissions, func(i, j int) bool { return permissions[i] < permissions[j] })
	role.Permissions = permissions
	return role, nil
}

func normalizePrincipal(catalog domain.PermissionCatalog, principal domain.Principal) (domain.Principal, error) {
	if len(principal.Roles) == 0 {
		return domain.Principal{}, ErrDependencyUnavailable
	}
	superAdmin := false
	rolePermissions := make([]domain.PermissionKey, 0)
	for index := range principal.Roles {
		role, err := normalizeRole(catalog, principal.Roles[index])
		if err != nil {
			return domain.Principal{}, err
		}
		principal.Roles[index] = role
		rolePermissions = append(rolePermissions, role.Permissions...)
		if role.IsSystem() {
			superAdmin = true
		}
	}
	rolePermissions = uniquePermissionKeys(rolePermissions)
	if len(principal.Permissions) > 0 {
		// PostgreSQL currently returns this denormalized summary as a useful
		// integrity signal. It is never an authority source: only permissions
		// carried by the normalized role assignments are used below.
		summary := append([]domain.PermissionKey(nil), principal.Permissions...)
		for _, permission := range summary {
			if !catalog.Has(permission) {
				return domain.Principal{}, ErrDependencyUnavailable
			}
		}
		sort.Slice(summary, func(i, j int) bool { return summary[i] < summary[j] })
		if !samePermissionKeys(summary, rolePermissions) {
			return domain.Principal{}, ErrDependencyUnavailable
		}
	}
	principal.SuperAdmin = superAdmin
	principal.Permissions = rolePermissions
	return principal, nil
}

func uniquePermissionKeys(keys []domain.PermissionKey) []domain.PermissionKey {
	seen := make(map[domain.PermissionKey]struct{}, len(keys))
	result := make([]domain.PermissionKey, 0, len(keys))
	for _, key := range keys {
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, key)
	}
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
	return result
}

func samePermissionKeys(left, right []domain.PermissionKey) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

// ensurePrincipalIdentity keeps the projection lookup bound to the identity
// which authenticated the request. A repository that accidentally returns a
// different user's projection must never grant that projection's authority to
// the requested actor.
func ensurePrincipalIdentity(expectedID string, principal domain.Principal) error {
	if expectedID == "" || principal.User.ID != expectedID {
		return ErrDependencyUnavailable
	}
	return nil
}

func normalizeAccessUser(catalog domain.PermissionCatalog, user domain.AccessUser) (domain.AccessUser, error) {
	if len(user.Roles) == 0 {
		return domain.AccessUser{}, ErrDependencyUnavailable
	}
	for index := range user.Roles {
		role, err := normalizeRole(catalog, user.Roles[index])
		if err != nil {
			return domain.AccessUser{}, err
		}
		user.Roles[index] = role
	}
	return user, nil
}

func normalizeInvitation(catalog domain.PermissionCatalog, invitation domain.Invitation) (domain.Invitation, error) {
	if len(invitation.Roles) == 0 {
		return domain.Invitation{}, ErrDependencyUnavailable
	}
	for index := range invitation.Roles {
		role, err := normalizeRole(catalog, invitation.Roles[index])
		if err != nil {
			return domain.Invitation{}, err
		}
		invitation.Roles[index] = role
	}
	return invitation, nil
}
