import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RolesPage } from './roles-page'
import { UsersPage } from './users-page'
import { AccessError } from './access-error'
import { ApiProblemError, ApiTransportError, type ApiClient } from '@/shared/api/client'
import type { Permission, Role } from '@/shared/api/contracts'
import { i18n, initializeI18n } from '@/shared/i18n'

const usersRole: Role = {
  id: '019535d9-3df7-79fb-b466-fa907fa17f95',
  name: 'Users reader',
  description: 'Read users',
  permissions: ['users.read'],
  revision: 1,
  assignmentCount: 1,
}

const rolesRole: Role = {
  id: '019535d9-3df7-79fb-b466-fa907fa17f96',
  name: 'Roles reader',
  description: 'Read roles',
  permissions: ['roles.read'],
  revision: 1,
  assignmentCount: 0,
}

const systemRole: Role = {
  id: '019535d9-3df7-79fb-b466-fa907fa17f94',
  name: 'Super Admin',
  description: '',
  system: 'super_admin',
  permissions: ['roles.read', 'users.read'],
  revision: 1,
  assignmentCount: 1,
}

const permissionDefinitions: Permission[] = [
  { key: 'users.read', resource: 'users', action: 'read', labelKey: 'permissions.users.read', description: 'View users' },
  { key: 'roles.read', resource: 'roles', action: 'read', labelKey: 'permissions.roles.read', description: 'View roles' },
]

function mockApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getSetupStatus: vi.fn(),
    setup: vi.fn(),
    login: vi.fn(),
    me: vi.fn(),
    logout: vi.fn(),
    requestPasswordReset: vi.fn(),
    completePasswordReset: vi.fn(),
    ...overrides,
  }
}

function renderWithQueryClient(element: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>)
}

function problem(type: string, status: number, code?: string) {
  return new ApiProblemError({ type, title: 'diagnostic', status, ...(code ? { code } : {}) })
}

describe('access components', () => {
  beforeEach(async () => {
    await initializeI18n()
    await i18n.changeLanguage('en')
  })

  it('groups the role permission picker by resource', async () => {
    const api = mockApi({
      getRoles: vi.fn().mockResolvedValue({ roles: [systemRole, usersRole, rolesRole], permissions: permissionDefinitions }),
    })
    const view = renderWithQueryClient(<RolesPage api={api} canManage />)

    await screen.findByRole('heading', { name: 'Roles and permissions' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create role' }))

    await waitFor(() => expect(view.container.querySelectorAll('fieldset > legend')).toHaveLength(3))
    const legends = Array.from(view.container.querySelectorAll('fieldset > legend')).map((legend) => legend.textContent)
    expect(legends).toEqual(['Permissions', 'Roles', 'Users'])
    expect(screen.getByRole('checkbox', { name: /View users/ })).toBeVisible()
    expect(screen.getByRole('checkbox', { name: /View roles/ })).toBeVisible()
  })

  it('renders a read-only users page without loading role administration data', async () => {
    const api = mockApi({
      getUsers: vi.fn().mockResolvedValue({ users: [{ id: '019535d9-3df7-79fb-b466-fa907fa17f91', name: 'Ada', email: 'ada@example.com', createdAt: '2026-09-02T00:00:00Z', authVersion: 1, roles: [usersRole] }] }),
      getRoles: vi.fn(),
    })
    renderWithQueryClient(<UsersPage api={api} canManage={false} />)

    expect(await screen.findByText('Ada')).toBeVisible()
    expect(api.getRoles).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Invite user' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('requires explicit invitation role selection instead of defaulting to Super Admin', async () => {
    const api = mockApi({
      getUsers: vi.fn().mockResolvedValue({ users: [{ id: '019535d9-3df7-79fb-b466-fa907fa17f91', name: 'Ada', email: 'ada@example.com', createdAt: '2026-09-02T00:00:00Z', authVersion: 1, roles: [usersRole] }] }),
      getRoles: vi.fn().mockResolvedValue({ roles: [systemRole, usersRole], permissions: permissionDefinitions }),
      getInvitations: vi.fn().mockResolvedValue({ invitations: [] }),
    })
    const user = userEvent.setup()
    renderWithQueryClient(<UsersPage api={api} canManage />)

    await screen.findByText('Ada')
    await user.click(screen.getByRole('button', { name: 'Invite user' }))
    const inviteForm = screen.getByLabelText('Name').closest('form')
    expect(inviteForm).not.toBeNull()
    expect(within(inviteForm!).getByRole('checkbox', { name: 'Super Admin' })).not.toBeChecked()
    expect(within(inviteForm!).getByRole('checkbox', { name: 'Users reader' })).not.toBeChecked()
  })

  it('distinguishes forbidden failures and does not offer a misleading retry', () => {
    render(<AccessError error={problem('/problems/forbidden', 403, 'forbidden')} onRetry={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Access denied' })).toBeVisible()
    expect(screen.getByText('Your account does not have permission to view this page.')).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('distinguishes conflicts and offers reload recovery', async () => {
    const reload = vi.fn()
    render(<AccessError error={problem('/problems/role-in-use', 409, 'role_in_use')} onReload={reload} />)

    expect(screen.getByRole('heading', { name: 'This record changed' })).toBeVisible()
    expect(screen.getByText('This role is still assigned. Reassign users and invitations first.')).toBeVisible()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('distinguishes validation failures and dependency failures', async () => {
    const retry = vi.fn()
    const view = render(<AccessError error={problem('/problems/validation-failed', 422, 'validation_failed')} onRetry={retry} />)
    expect(screen.getByRole('heading', { name: 'Review the access details' })).toBeVisible()
    expect(screen.getByText('Review the highlighted fields and try again.')).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    view.unmount()
    render(<AccessError error={new ApiTransportError('network')} onRetry={retry} />)
    expect(screen.getByRole('heading', { name: 'Access data is unavailable' })).toBeVisible()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('refreshes the selected role before retrying a stale edit', async () => {
    const refreshedRole: Role = { ...usersRole, name: 'Users editor', description: 'Updated users', revision: 2 }
    const getRoles = vi.fn()
      .mockResolvedValueOnce({ roles: [systemRole, usersRole, rolesRole], permissions: permissionDefinitions })
      .mockResolvedValue({ roles: [systemRole, refreshedRole, rolesRole], permissions: permissionDefinitions })
    const replaceRole = vi.fn()
      .mockRejectedValueOnce(problem('/problems/stale-revision', 409, 'stale_revision'))
      .mockResolvedValue(refreshedRole)
    const api = mockApi({ getRoles, replaceRole })
    const user = userEvent.setup()
    renderWithQueryClient(<RolesPage api={api} canManage />)

    await screen.findByRole('heading', { name: 'Roles and permissions' })
    await user.click(screen.getByText('Users reader'))
    await user.click(screen.getByRole('button', { name: 'Save role' }))
    await screen.findByRole('heading', { name: 'This record changed' })

    await user.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.getByDisplayValue('Users editor')).toBeVisible())
    expect(screen.getByDisplayValue('Updated users')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Save role' }))
    await waitFor(() => expect(replaceRole).toHaveBeenCalledTimes(2))
    expect(replaceRole).toHaveBeenLastCalledWith(usersRole.id, {
      name: 'Users editor',
      description: 'Updated users',
      permissions: ['users.read'],
      revision: 2,
    })
  })

  it('synchronizes local role selection after a stale assignment refresh', async () => {
    const userRecord = {
      id: '019535d9-3df7-79fb-b466-fa907fa17f91',
      name: 'Ada',
      email: 'ada@example.com',
      createdAt: '2026-09-02T00:00:00Z',
      authVersion: 1,
      roles: [usersRole],
    }
    const refreshedUser = { ...userRecord, authVersion: 2, roles: [rolesRole] }
    const getUsers = vi.fn().mockResolvedValueOnce({ users: [userRecord] }).mockResolvedValue({ users: [refreshedUser] })
    const replaceUserRoles = vi.fn()
      .mockRejectedValueOnce(problem('/problems/stale-revision', 409, 'stale_revision'))
      .mockResolvedValue({ user: refreshedUser })
    const api = mockApi({
      getUsers,
      getRoles: vi.fn().mockResolvedValue({ roles: [usersRole, rolesRole], permissions: permissionDefinitions }),
      getInvitations: vi.fn().mockResolvedValue({ invitations: [] }),
      replaceUserRoles,
    })
    const user = userEvent.setup()
    renderWithQueryClient(<UsersPage api={api} canManage />)

    await screen.findByText('Ada')
    const usersCheckbox = screen.getByRole('checkbox', { name: 'Users reader' })
    const rolesCheckbox = screen.getByRole('checkbox', { name: 'Roles reader' })
    await user.click(usersCheckbox)
    await user.click(rolesCheckbox)
    await user.click(screen.getByRole('button', { name: 'Save assignments' }))
    await screen.findByRole('heading', { name: 'This record changed' })

    await user.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Users reader' })).not.toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'Roles reader' })).toBeChecked()
      expect(screen.getByRole('button', { name: 'Save assignments' })).toBeDisabled()
    })

    await user.click(screen.getByRole('checkbox', { name: 'Roles reader' }))
    await user.click(screen.getByRole('checkbox', { name: 'Users reader' }))
    await user.click(screen.getByRole('button', { name: 'Save assignments' }))
    await waitFor(() => expect(replaceUserRoles).toHaveBeenCalledTimes(2))
    expect(replaceUserRoles).toHaveBeenLastCalledWith(refreshedUser.id, {
      roleIds: [usersRole.id],
      authVersion: 2,
    })
  })
})
