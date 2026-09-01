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
	Key         PermissionKey
	Resource    string
	Action      string
	LabelKey    string
	Description string
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
	return PermissionCatalog{items: items}, nil
}

func DefaultPermissionCatalog() PermissionCatalog {
	catalog, _ := NewPermissionCatalog(
		PermissionDefinition{Key: PermissionUsersRead, Resource: "users", Action: "read", LabelKey: "permissions.users.read", Description: "View users and their assigned roles."},
		PermissionDefinition{Key: PermissionRolesRead, Resource: "roles", Action: "read", LabelKey: "permissions.roles.read", Description: "View roles and their grants."},
	)
	return catalog
}

const (
	PermissionUsersRead PermissionKey = "users.read"
	PermissionRolesRead PermissionKey = "roles.read"
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
		result = append(result, key)
	}
	if len(result) == 0 {
		return nil, &ValidationErrors{Items: []FieldError{{Field: "permissions", Code: "empty_permissions"}}}
	}
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
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
