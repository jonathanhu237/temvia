package domain

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
)

type PermissionKey string

type PermissionDefinition struct {
	Key          PermissionKey
	Resource     string
	Action       string
	LabelKey     string
	Description  string
	Dependencies []PermissionKey
}

type PermissionCatalog struct {
	items map[PermissionKey]PermissionDefinition
}

var permissionKeyPattern = regexp.MustCompile(`^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$`)

func NewPermissionCatalog(definitions ...PermissionDefinition) (PermissionCatalog, error) {
	items := make(map[PermissionKey]PermissionDefinition, len(definitions))
	for _, definition := range definitions {
		key := definition.Key
		if !permissionKeyPattern.MatchString(string(key)) || definition.Resource == "" || definition.Action == "" || definition.LabelKey == "" {
			return PermissionCatalog{}, fmt.Errorf("invalid permission definition %q", key)
		}
		if _, exists := items[key]; exists {
			return PermissionCatalog{}, fmt.Errorf("duplicate permission definition %q", key)
		}
		items[key] = definition
	}
	for _, definition := range items {
		seen := make(map[PermissionKey]struct{}, len(definition.Dependencies))
		for _, dependency := range definition.Dependencies {
			if !hasPermission(items, dependency) || dependency == definition.Key {
				return PermissionCatalog{}, fmt.Errorf("invalid dependency %q for permission %q", dependency, definition.Key)
			}
			if _, exists := seen[dependency]; exists {
				return PermissionCatalog{}, fmt.Errorf("duplicate dependency %q for permission %q", dependency, definition.Key)
			}
			seen[dependency] = struct{}{}
		}
	}
	for key := range items {
		if _, err := permissionDependencies(items, key, nil); err != nil {
			return PermissionCatalog{}, err
		}
	}
	return PermissionCatalog{items: items}, nil
}

func DefaultPermissionCatalog() PermissionCatalog {
	catalog, _ := NewPermissionCatalog(
		PermissionDefinition{Key: PermissionUsersRead, Resource: "users", Action: "read", LabelKey: "permissions.users.read", Description: "View users and their assigned roles."},
		PermissionDefinition{Key: PermissionRolesRead, Resource: "roles", Action: "read", LabelKey: "permissions.roles.read", Description: "View roles and their grants."},
		PermissionDefinition{Key: PermissionInvitationsRead, Resource: "invitations", Action: "read", LabelKey: "permissions.invitations.read", Description: "View invitations, their status, and assigned roles.", Dependencies: []PermissionKey{PermissionUsersRead}},
		PermissionDefinition{Key: PermissionInvitationsManage, Resource: "invitations", Action: "manage", LabelKey: "permissions.invitations.manage", Description: "Create, resend, renew, and revoke invitations.", Dependencies: []PermissionKey{PermissionInvitationsRead, PermissionRolesRead}},
	)
	return catalog
}

const (
	PermissionUsersRead         PermissionKey = "users.read"
	PermissionRolesRead         PermissionKey = "roles.read"
	PermissionInvitationsRead   PermissionKey = "invitations.read"
	PermissionInvitationsManage PermissionKey = "invitations.manage"
)

func (c PermissionCatalog) Has(key PermissionKey) bool { _, ok := c.items[key]; return ok }

func (c PermissionCatalog) Definitions() []PermissionDefinition {
	items := make([]PermissionDefinition, 0, len(c.items))
	for _, definition := range c.items {
		items = append(items, definition)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Key < items[j].Key })
	return items
}

func (c PermissionCatalog) Keys() []PermissionKey {
	keys := make([]PermissionKey, 0, len(c.items))
	for key := range c.items {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	return keys
}

// Dependencies returns the transitive dependency set for a known permission.
// The returned keys are sorted and do not include key itself.
func (c PermissionCatalog) Dependencies(key PermissionKey) []PermissionKey {
	if !c.Has(key) {
		return nil
	}
	dependencies, err := permissionDependencies(c.items, key, nil)
	if err != nil {
		return nil
	}
	delete(dependencies, key)
	result := make([]PermissionKey, 0, len(dependencies))
	for dependency := range dependencies {
		result = append(result, dependency)
	}
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
	return result
}

func (c PermissionCatalog) Validate(keys []PermissionKey) ([]PermissionKey, error) {
	seen := make(map[PermissionKey]struct{}, len(keys))
	result := make([]PermissionKey, 0, len(keys))
	for _, key := range keys {
		if !c.Has(key) {
			return nil, &ValidationErrors{Items: []FieldError{{Field: "permissions", Code: "unknown_permission", Params: map[string]any{"key": string(key)}}}}
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		dependencies, err := permissionDependencies(c.items, key, nil)
		if err != nil {
			return nil, err
		}
		for dependency := range dependencies {
			seen[dependency] = struct{}{}
		}
	}
	if len(seen) == 0 {
		return nil, &ValidationErrors{Items: []FieldError{{Field: "permissions", Code: "empty_permissions"}}}
	}
	result = result[:0]
	for key := range seen {
		result = append(result, key)
	}
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
	return result, nil
}

func hasPermission(items map[PermissionKey]PermissionDefinition, key PermissionKey) bool {
	_, ok := items[key]
	return ok
}

func permissionDependencies(items map[PermissionKey]PermissionDefinition, key PermissionKey, visiting map[PermissionKey]bool) (map[PermissionKey]struct{}, error) {
	definition, ok := items[key]
	if !ok {
		return nil, fmt.Errorf("unknown permission dependency %q", key)
	}
	if visiting == nil {
		visiting = make(map[PermissionKey]bool)
	}
	if visiting[key] {
		return nil, fmt.Errorf("cyclic permission dependency %q", key)
	}
	visiting[key] = true
	result := map[PermissionKey]struct{}{key: {}}
	for _, dependency := range definition.Dependencies {
		dependencies, err := permissionDependencies(items, dependency, visiting)
		if err != nil {
			return nil, err
		}
		for item := range dependencies {
			result[item] = struct{}{}
		}
	}
	delete(visiting, key)
	return result, nil
}

type Role struct {
	ID              string
	SystemKey       string
	Name            string
	Description     string
	Permissions     []PermissionKey
	Revision        int64
	AssignmentCount int
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (r Role) IsSystem() bool { return r.SystemKey != "" }

type Principal struct {
	User        User
	Roles       []Role
	Permissions []PermissionKey
	SuperAdmin  bool
}

func (p Principal) Has(key PermissionKey) bool {
	if p.SuperAdmin {
		return true
	}
	for _, item := range p.Permissions {
		if item == key {
			return true
		}
	}
	return false
}

func (p Principal) EffectivePermissions(catalog PermissionCatalog) []PermissionKey {
	if p.SuperAdmin {
		return catalog.Keys()
	}
	seen := make(map[PermissionKey]struct{})
	for _, key := range p.Permissions {
		if catalog.Has(key) {
			seen[key] = struct{}{}
		}
	}
	keys := make([]PermissionKey, 0, len(seen))
	for key := range seen {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	return keys
}

type AccessUser struct {
	User        User
	Roles       []Role
	AuthVersion int64
}

type Invitation struct {
	ID        string
	Name      string
	Email     string
	Locale    Locale
	Roles     []Role
	ExpiresAt time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
	Revision  int64
	CreatedBy string
}

func CanonicalRoleName(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), " "))
}
