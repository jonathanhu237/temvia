import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ApiProblemError, type ApiClient } from '@/shared/api/client'
import type { Permission, Role } from '@/shared/api/contracts'
import { AccessError } from './access-error'
import { DataTable, SortableHeader } from './data-table'
import { nextDraftSubmissionID, useAccessDraftStore } from './drafts'
import { roleQueryKey, rolesOptions, rolesQueryKey } from './queries'

export function RolesPage({ api, canManage }: { api: ApiClient; canManage: boolean }) {
  const { t } = useTranslation(['access', 'problems', 'common'])
  const queryClient = useQueryClient()
  const query = useQuery(rolesOptions(api))
  const [selected, setSelected] = useState<Role | undefined>()
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Role | undefined>()
  const [search, setSearch] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [notice, setNotice] = useState<unknown>()
  const [editorGeneration, setEditorGeneration] = useState(0)
  const editorGenerationRef = useRef(0)
  const advanceEditorGeneration = () => {
    const next = editorGenerationRef.current + 1
    editorGenerationRef.current = next
    setEditorGeneration(next)
  }

  const deleteMutation = useMutation({
    retry: false,
    mutationFn: async (role: Role) => {
      if (!api.deleteRole) throw new Error('missing deleteRole')
      await api.deleteRole(role.id)
    },
    onSuccess: (_, role) => {
      setNotice(undefined)
      setSelected((current) => current?.id === role.id ? undefined : current)
      setRoleDialogOpen(false)
      setDeleteTarget(undefined)
      useAccessDraftStore.getState().setRoleEdit(role.id, undefined)
      void queryClient.invalidateQueries({ queryKey: rolesQueryKey })
    },
    onError: setNotice,
  })

  const roles = useMemo(() => query.data?.roles ?? [], [query.data?.roles])
  const selectedRole = selected ? roles.find((role) => role.id === selected.id) ?? selected : undefined
  const filteredRoles = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    return needle ? roles.filter((role) => role.name.toLocaleLowerCase().includes(needle)) : roles
  }, [roles, search])

  const openCreate = () => {
    advanceEditorGeneration()
    setSelected(undefined)
    setRoleDialogOpen(true)
    setNotice(undefined)
  }
  const openEdit = useCallback((role: Role) => {
    advanceEditorGeneration()
    setSelected(role)
    setRoleDialogOpen(canManage && !role.system)
    setNotice(undefined)
  }, [canManage])
  const handleSorting: OnChangeFn<SortingState> = (updater) => {
    setSorting((current) => typeof updater === 'function' ? updater(current) : updater)
  }
  const reloadRoles = async () => {
    setNotice(undefined)
    const result = await query.refetch()
    if (result.error || !result.data || !selectedRole) return
    const refreshed = result.data.roles.find((role) => role.id === selectedRole.id)
    setSelected(refreshed)
    if (!refreshed) {
      setRoleDialogOpen(false)
      return
    }
    useAccessDraftStore.getState().setRoleEdit(refreshed.id, undefined)
  }

  const columns = useMemo<ColumnDef<Role, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => <SortableHeader column={column}>{t('roleName')}</SortableHeader>,
      cell: ({ row }) => (
        <button type="button" className="flex min-w-0 flex-col items-start text-left" onClick={() => openEdit(row.original)}>
          <span className="max-w-56 truncate font-medium">{row.original.name}</span>
          <span className="max-w-72 truncate text-xs text-muted-foreground">{row.original.system ? t('systemRole') : t('customRole')}</span>
        </button>
      ),
    },
    {
      accessorKey: 'description',
      enableSorting: false,
      header: () => <span>{t('roleDescription')}</span>,
      cell: ({ row }) => <span className="max-w-64 truncate text-sm text-muted-foreground">{row.original.description || '—'}</span>,
    },
    {
      id: 'permissions',
      accessorFn: (role) => role.permissions.length,
      header: ({ column }) => <SortableHeader column={column}>{t('permissionCount')}</SortableHeader>,
      cell: ({ row }) => <span>{row.original.permissions.length}</span>,
    },
    {
      id: 'type',
      accessorFn: (role) => role.system ? 'system' : 'custom',
      header: ({ column }) => <SortableHeader column={column}>{t('type')}</SortableHeader>,
      cell: ({ row }) => <span>{row.original.system ? t('systemRole') : t('customRole')}</span>,
    },
    {
      id: 'assignments',
      accessorFn: (role) => role.assignmentCount ?? 0,
      header: ({ column }) => <SortableHeader column={column}>{t('assignmentCount')}</SortableHeader>,
      cell: ({ row }) => <span>{row.original.assignmentCount ?? 0}</span>,
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => <span>{t('actions')}</span>,
      cell: ({ row }) => canManage ? (
        <div className="flex justify-end gap-1">
          {!row.original.system ? <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(row.original)}>
            <Pencil aria-hidden="true" />
            {t('edit')}
          </Button> : null}
          {!row.original.system ? <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteTarget(row.original)}>
            <Trash2 aria-hidden="true" />
            {t('delete')}
          </Button> : null}
        </div>
      ) : null,
    },
  ], [canManage, openEdit, t])

  if (query.isPending) return <p role="status">{t('common:loading')}</p>
  if (query.isError) return <AccessError error={query.error} onRetry={() => void query.refetch()} />

  return (
    <section className="flex flex-col gap-5" aria-labelledby="roles-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 id="roles-title" className="text-2xl font-semibold tracking-tight">{t('rolesTitle')}</h1><p className="text-sm text-muted-foreground">{t('rolesDescription')}</p></div>
        {canManage ? <Button type="button" onClick={openCreate}><Plus aria-hidden="true" />{t('createRole')}</Button> : null}
      </div>
      {notice !== undefined ? <AccessError error={notice} onReload={() => void reloadRoles()} /> : null}
      <Card>
        <CardHeader><CardTitle className="text-lg">{t('roles')}</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredRoles}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('searchRoles')}
            clearSearchLabel={t('clearSearch')}
            emptyMessage={search ? t('noSearchResults') : t('noRoles')}
            manualFiltering
            sorting={sorting}
            onSortingChange={handleSorting}
          />
        </CardContent>
      </Card>
      {selectedRole && (!canManage || selectedRole.system) ? <RoleSummary role={selectedRole} /> : null}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent forceMount closeLabel={t('common:close')} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <RoleEditor
            key={selectedRole?.id ?? 'new'}
            api={api}
            role={selectedRole}
            permissions={query.data?.permissions ?? []}
            open={roleDialogOpen}
            editorGeneration={editorGeneration}
            onDone={(role, generation) => {
              if (generation !== editorGenerationRef.current) return
              setSelected(role)
              setRoleDialogOpen(false)
              void queryClient.invalidateQueries({ queryKey: rolesQueryKey })
              void queryClient.invalidateQueries({ queryKey: roleQueryKey(role.id) })
            }}
            onReload={reloadRoles}
          />
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteRole')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteRoleConfirm', { name: deleteTarget?.name ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={deleteMutation.isPending} onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget) }}>{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function RoleSummary({ role }: { role: Role }) {
  const { t } = useTranslation('access')
  const translate = (key: string) => t(key as never)
  return <Card><CardHeader><CardTitle>{role.name}</CardTitle><CardDescription>{role.system ? t('systemRoleReadOnly') : t('customRole')}</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">{role.description || '—'}</p><ul className="mt-4 list-disc pl-5 text-sm">{role.permissions.map((permission) => <li key={permission}>{localizedPermission(permission, translate)}</li>)}</ul></CardContent></Card>
}

function RoleEditor({ api, role, permissions, open, editorGeneration, onDone, onReload }: { api: ApiClient; role?: Role; permissions: Permission[]; open: boolean; editorGeneration: number; onDone: (role: Role, generation: number) => void; onReload: () => Promise<void> }) {
  const { t } = useTranslation(['access', 'problems', 'common'])
  const queryClient = useQueryClient()
  const roleCreate = useAccessDraftStore((state) => state.roleCreate)
  const roleEdit = useAccessDraftStore((state) => role ? state.roleEdits[role.id] : undefined)
  const setRoleCreate = useAccessDraftStore((state) => state.setRoleCreate)
  const setRoleEdit = useAccessDraftStore((state) => state.setRoleEdit)
  const [error, setError] = useState<unknown>()
  const draft = role ? roleEdit : roleCreate
  const initial = useMemo(() => role
    ? { id: role.id, revision: role.revision, name: role.name, description: role.description, permissions: role.permissions.slice() }
    : { name: '', description: '', permissions: [] as string[] }, [role])

  useEffect(() => {
    if (!open) return
    if (!role) {
      if (!roleCreate) setRoleCreate({ ...initial, submitting: false, conflict: false })
      return
    }
    if (!roleEdit) {
      setRoleEdit(role.id, { ...initial, submitting: false, conflict: false })
      return
    }
    if (roleEdit.revision !== role.revision && !roleEdit.conflict) {
      setRoleEdit(role.id, { ...roleEdit, conflict: true })
    }
  }, [initial, open, role, roleCreate, roleEdit, setRoleCreate, setRoleEdit])

  const current = draft ?? { ...initial, submitting: false, conflict: false }
  type Submission = { ownerID?: string; submissionID: string }
  const updateDraft = (patch: Partial<typeof current>, submission?: Submission): boolean => {
    const state = useAccessDraftStore.getState()
    const existing = role ? state.roleEdits[role.id] : state.roleCreate
    if (submission && (state.ownerID !== submission.ownerID || existing?.submissionID !== submission.submissionID)) return false
    const next = { ...(existing ?? current), ...patch }
    if (role) setRoleEdit(role.id, next)
    else setRoleCreate(next)
    return true
  }
  const update = (patch: Partial<typeof current>) => {
    setError(undefined)
    updateDraft(patch)
  }
  const beginSubmission = (): Submission => {
    const state = useAccessDraftStore.getState()
    const existing = role ? state.roleEdits[role.id] : state.roleCreate
    const submission = { ownerID: state.ownerID, submissionID: nextDraftSubmissionID() }
    updateDraft({ ...(existing ?? current), submissionID: submission.submissionID, submitting: false, conflict: false })
    return submission
  }
  const resetDraft = () => {
    setError(undefined)
    const next = { ...initial, submitting: false, conflict: false, validationError: undefined }
    if (role) setRoleEdit(role.id, next)
    else setRoleCreate(next)
  }
  const permissionGroups = Object.entries(permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
    const group = groups[permission.resource] ?? []
    group.push(permission)
    groups[permission.resource] = group
    return groups
  }, {})).sort(([left], [right]) => left.localeCompare(right))
  const translate = (key: string) => t(key as never)
  const mutation = useMutation({
    retry: false,
    mutationFn: async (submission: Submission) => {
      const state = useAccessDraftStore.getState()
      const draft = role ? state.roleEdits[role.id] : state.roleCreate
      if (!draft || state.ownerID !== submission.ownerID || draft.submissionID !== submission.submissionID) throw new Error('stale draft')
      if (!draft.name.trim()) { updateDraft({ validationError: 'name' }, submission); throw new Error('invalid name') }
      if (draft.permissions.length === 0) { updateDraft({ validationError: 'permissions' }, submission); throw new Error('invalid permissions') }
      const availablePermissions = new Set(permissions.map((permission) => permission.key))
      if (draft.permissions.some((permission) => !availablePermissions.has(permission))) {
        updateDraft({ validationError: 'invalidPermissions' }, submission)
        throw new Error('invalid permissions')
      }
      if (!updateDraft({ submitting: true, validationError: undefined, conflict: false }, submission)) throw new Error('stale draft')
      if (role) {
        if (!api.replaceRole) throw new Error('missing replaceRole')
        return api.replaceRole(role.id, { name: draft.name, description: draft.description, permissions: draft.permissions, revision: draft.revision ?? role.revision })
      }
      if (!api.createRole) throw new Error('missing createRole')
      return api.createRole({ name: draft.name, description: draft.description, permissions: draft.permissions })
    },
    onSuccess: (saved, submission) => {
      const state = useAccessDraftStore.getState()
      if (state.ownerID !== submission.ownerID) return
      void queryClient.invalidateQueries({ queryKey: rolesQueryKey })
      if (role) void queryClient.invalidateQueries({ queryKey: roleQueryKey(role.id) })
      const existing = role ? state.roleEdits[role.id] : state.roleCreate
      if (existing?.submissionID !== submission.submissionID) return
      setError(undefined)
      if (role) setRoleEdit(role.id, undefined)
      else setRoleCreate(undefined)
      onDone(saved, editorGeneration)
    },
    onError: (error, submission) => {
      if (!submission) return
      if (!updateDraft({ submitting: false }, submission)) return
      if (isStaleRevision(error)) updateDraft({ conflict: true }, submission)
      else if (!(error instanceof Error && (error.message === 'invalid name' || error.message === 'invalid permissions'))) setError(error)
    },
  })

  return <>
    <DialogHeader>
      <DialogTitle>{role ? t('editRole') : t('createRole')}</DialogTitle>
      <DialogDescription>{t('rolesDescription')}</DialogDescription>
    </DialogHeader>
    {error !== undefined ? <AccessError error={error} /> : null}
    {current.conflict ? <AccessError error={new ApiProblemError({ type: '/problems/stale-revision', title: 'stale revision', status: 409, code: 'stale_revision' })} descriptionOverride={t('draftConflictDescription')} reloadLabel={t('reloadLatest')} onReload={() => void onReload()} /> : null}
    <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); if (!current.submitting && !mutation.isPending) mutation.mutate(beginSubmission()) }} noValidate>
      <FieldGroup>
        <Field data-invalid={current.validationError === 'name'}>
          <FieldLabel htmlFor="role-name">{t('roleName')}</FieldLabel>
          <Input id="role-name" value={current.name} onChange={(event) => update({ name: event.target.value, validationError: undefined })} aria-invalid={current.validationError === 'name'} disabled={current.submitting || mutation.isPending} />
          {current.validationError === 'name' ? <FieldError>{t('problems:fields.invalidValue')}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="role-description">{t('roleDescription')}</FieldLabel>
          <textarea id="role-description" className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={current.description} onChange={(event) => update({ description: event.target.value })} disabled={current.submitting || mutation.isPending} />
        </Field>
        <fieldset className="flex flex-col gap-4" aria-describedby={current.validationError === 'permissions' || current.validationError === 'invalidPermissions' ? 'role-permissions-error' : undefined}>
          <legend className="text-sm font-medium">{t('permissions')}</legend>
          {permissionGroups.map(([resource, items]) => <fieldset key={resource} className="flex flex-col gap-2 rounded-md bg-muted/30 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{localizedResource(resource, translate)}</legend>
            {items.map((permission) => {
              const checked = current.permissions.includes(permission.key)
              return <label key={permission.key} className="flex items-start gap-3 rounded-md border bg-background p-3">
                <Checkbox checked={checked} onCheckedChange={(value) => update({ permissions: value === true ? [...current.permissions, permission.key] : current.permissions.filter((key) => key !== permission.key), validationError: undefined })} aria-label={localizedPermission(permission.key, translate)} disabled={current.submitting || mutation.isPending} />
                <span><span className="block text-sm font-medium">{localizedPermission(permission.key, translate)}</span><span className="block text-xs text-muted-foreground">{localizedPermissionDescription(permission.key, translate, permission.description)}</span></span>
              </label>
            })}
          </fieldset>)}
          {current.validationError === 'permissions' || current.validationError === 'invalidPermissions' ? <FieldError id="role-permissions-error">{current.validationError === 'invalidPermissions' ? t('invalidPermissionSelection') : t('requiredPermission')}</FieldError> : null}
        </fieldset>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={resetDraft}>{t('common:reset')}</Button>
        <DialogClose asChild><Button type="button" variant="outline">{t('common:cancel')}</Button></DialogClose>
        <Button type="submit" disabled={current.submitting || mutation.isPending}><Save aria-hidden="true" />{current.submitting || mutation.isPending ? t('saving') : t('saveRole')}</Button>
      </DialogFooter>
    </form>
  </>
}

function isStaleRevision(error: unknown): boolean {
  return error instanceof ApiProblemError && (error.problem.code === 'stale_revision' || error.problem.type === '/problems/stale-revision')
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
