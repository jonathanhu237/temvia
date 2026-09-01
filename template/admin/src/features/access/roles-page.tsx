import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { type ApiClient } from '@/shared/api/client'
import type { Permission, Role } from '@/shared/api/contracts'
import { AccessError } from './access-error'
import { roleQueryKey, rolesOptions, rolesQueryKey } from './queries'

export function RolesPage({ api, canManage }: { api: ApiClient; canManage: boolean }) {
  const { t } = useTranslation(['access', 'problems', 'common'])
  const queryClient = useQueryClient()
  const query = useQuery(rolesOptions(api))
  const [selected, setSelected] = useState<Role | undefined>()
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<unknown>()

  const deleteMutation = useMutation({
    retry: false,
    mutationFn: async (role: Role) => {
      if (!api.deleteRole) throw new Error('missing deleteRole')
      await api.deleteRole(role.id)
    },
    onSuccess: (_, role) => {
      setNotice(undefined)
      setSelected((current) => current?.id === role.id ? undefined : current)
      void queryClient.invalidateQueries({ queryKey: rolesQueryKey })
    },
    onError: setNotice,
  })

  const roles = query.data?.roles ?? []
  const hasCustomRoles = roles.some((role) => !role.system)
  const reloadRoles = async () => {
    setNotice(undefined)
    const result = await query.refetch()
    if (result.error || !result.data || !selected) return
    const refreshed = result.data.roles.find((role) => role.id === selected.id)
    setSelected(refreshed)
    if (!refreshed) setCreating(false)
  }
  if (query.isPending) return <p role="status">{t('common:loading')}</p>
  if (query.isError) return <AccessError error={query.error} onRetry={() => void query.refetch()} />

  return (
    <section className="flex flex-col gap-5" aria-labelledby="roles-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 id="roles-title" className="text-2xl font-semibold tracking-tight">{t('rolesTitle')}</h1><p className="text-sm text-muted-foreground">{t('rolesDescription')}</p></div>
        {canManage && <Button type="button" onClick={() => { setCreating(true); setSelected(undefined); setNotice(undefined) }}><Plus aria-hidden="true" />{t('createRole')}</Button>}
      </div>
      {notice !== undefined && <AccessError error={notice} onReload={() => void reloadRoles()} />}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
        <Card><CardHeader><CardTitle className="text-lg">{t('roles')}</CardTitle></CardHeader><CardContent>
          <div className="flex flex-col divide-y" role="list">
            {roles.map((role) => <button key={role.id} type="button" role="listitem" className="flex w-full items-start justify-between gap-3 py-4 text-left first:pt-0 last:pb-0 hover:bg-muted/30" onClick={() => { setSelected(role); setCreating(false); setNotice(undefined) }}>
              <span className="min-w-0"><span className="block truncate font-medium">{role.name}</span><span className="block text-sm text-muted-foreground">{role.system ? t('systemRole') : t('customRole')} · {role.permissions.length} {t('permissions').toLowerCase()}</span></span>
              {role.assignmentCount ? <span className="shrink-0 text-xs text-muted-foreground">{role.assignmentCount}</span> : null}
            </button>)}
            {roles.length === 0 && <p className="py-4 text-sm text-muted-foreground">{t('noRoles')}</p>}
          </div>
        </CardContent></Card>
        {(creating || selected) && canManage && !selected?.system ? <RoleEditor key={`${selected?.id ?? 'new'}:${selected?.revision ?? 'new'}`} api={api} role={selected} permissions={query.data?.permissions ?? []} onDone={(role) => { setSelected(role); setCreating(false); void queryClient.invalidateQueries({ queryKey: rolesQueryKey }); void queryClient.invalidateQueries({ queryKey: roleQueryKey(role.id) }) }} onError={setNotice} /> : selected ? <RoleSummary role={selected} /> : null}
      </div>
      {canManage && selected && !selected.system && <Button type="button" variant="destructive" className="self-start" disabled={deleteMutation.isPending} onClick={() => { if (window.confirm(t('deleteRoleConfirm', { name: selected.name }))) deleteMutation.mutate(selected) }}><Trash2 aria-hidden="true" />{t('deleteRole')}</Button>}
      {canManage && !hasCustomRoles && !creating && <p className="text-sm text-muted-foreground">{t('noRoles')}</p>}
    </section>
  )
}

function RoleSummary({ role }: { role: Role }) {
  const { t } = useTranslation('access')
  const translate = (key: string) => t(key as never)
  return <Card><CardHeader><CardTitle>{role.name}</CardTitle><CardDescription>{role.system ? t('systemRole') : t('customRole')}</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">{role.description || '—'}</p><ul className="mt-4 list-disc pl-5 text-sm">{role.permissions.map((permission) => <li key={permission}>{localizedPermission(permission, translate)}</li>)}</ul></CardContent></Card>
}

function RoleEditor({ api, role, permissions, onDone, onError }: { api: ApiClient; role?: Role; permissions: Permission[]; onDone: (role: Role) => void; onError: (error: unknown) => void }) {
  const { t } = useTranslation(['access', 'problems', 'common'])
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? [])
  const [nameError, setNameError] = useState(false)
  const [permissionError, setPermissionError] = useState(false)
  const translate = (key: string) => t(key as never)
  const permissionGroups = Object.entries(permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
    const group = groups[permission.resource] ?? []
    group.push(permission)
    groups[permission.resource] = group
    return groups
  }, {})).sort(([left], [right]) => left.localeCompare(right))
  const mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!name.trim()) { setNameError(true); throw new Error('invalid name') }
      if (selected.length === 0) { setPermissionError(true); throw new Error('invalid permissions') }
      if (role) {
        if (!api.replaceRole) throw new Error('missing replaceRole')
        return api.replaceRole(role.id, { name, description, permissions: selected, revision: role.revision })
      }
      if (!api.createRole) throw new Error('missing createRole')
      return api.createRole({ name, description, permissions: selected })
    },
    onSuccess: onDone,
    onError: (error) => { if (!(error instanceof Error && (error.message === 'invalid name' || error.message === 'invalid permissions'))) onError(error) },
  })
  return <Card><CardHeader><CardTitle>{role ? t('editRole') : t('createRole')}</CardTitle></CardHeader><CardContent><form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); setNameError(false); setPermissionError(false); mutation.mutate() }} noValidate>
    <FieldGroup>
      <Field data-invalid={nameError}><FieldLabel htmlFor="role-name">{t('roleName')}</FieldLabel><Input id="role-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={nameError} />{nameError && <FieldError>{t('problems:fields.invalidValue')}</FieldError>}</Field>
      <Field><FieldLabel htmlFor="role-description">{t('roleDescription')}</FieldLabel><textarea id="role-description" className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
      <fieldset className="flex flex-col gap-4" aria-describedby={permissionError ? 'role-permissions-error' : undefined}><legend className="text-sm font-medium">{t('permissions')}</legend>{permissionGroups.map(([resource, items]) => <fieldset key={resource} className="flex flex-col gap-2 rounded-md bg-muted/30 p-3"><legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{localizedResource(resource, translate)}</legend>{items.map((permission) => <label key={permission.key} className="flex items-start gap-3 rounded-md border bg-background p-3"><input type="checkbox" checked={selected.includes(permission.key)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, permission.key] : current.filter((key) => key !== permission.key))} /><span><span className="block text-sm font-medium">{localizedPermission(permission.key, translate)}</span><span className="block text-xs text-muted-foreground">{localizedPermissionDescription(permission.key, translate, permission.description)}</span></span></label>)}</fieldset>)}{permissionError && <FieldError id="role-permissions-error">{t('requiredPermission')}</FieldError>}</fieldset>
    </FieldGroup><Button type="submit" disabled={mutation.isPending}><Save aria-hidden="true" />{mutation.isPending ? t('saving') : t('saveRole')}</Button>
  </form></CardContent></Card>
}

const permissionLabelKeys: Record<string, string> = {
  'users.read': 'permissionUsersRead',
  'roles.read': 'permissionRolesRead',
}

const permissionDescriptionKeys: Record<string, string> = {
  'users.read': 'permissionUsersReadDescription',
  'roles.read': 'permissionRolesReadDescription',
}

function localizedPermission(key: string, t: (key: string) => string): string {
	return permissionLabelKeys[key] ? t(permissionLabelKeys[key]) : key
}

function localizedPermissionDescription(key: string, t: (key: string) => string, fallback: string): string {
  return permissionDescriptionKeys[key] ? t(permissionDescriptionKeys[key]) : fallback
}

const resourceLabelKeys: Record<string, string> = {
  users: 'users',
  roles: 'roles',
}

function localizedResource(resource: string, t: (key: string) => string): string {
  return resourceLabelKeys[resource] ? t(resourceLabelKeys[resource]) : resource
}
