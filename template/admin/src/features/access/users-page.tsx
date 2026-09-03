import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, Mail, Pencil, RefreshCw, Save, UserPlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiProblemError, type ApiClient } from '@/shared/api/client'
import type { Invitation, Role } from '@/shared/api/contracts'
import { AccessError } from './access-error'
import { DataTable, SortableHeader } from './data-table'
import { nextDraftSubmissionID, useAccessDraftStore } from './drafts'
import { invitationsOptions, rolesOptions, usersOptions } from './queries'

type AccessUser = { id: string; name: string; email: string; createdAt: string; authVersion: number; roles: Role[] }
type SortDirection = 'asc' | 'desc'
type UserSort = 'name' | 'email' | 'createdAt'
type InvitationSort = 'name' | 'email' | 'createdAt' | 'expiresAt'

export function UsersPage({ api, canManage }: { api: ApiClient; canManage: boolean }) {
  const { t, i18n } = useTranslation(['access', 'problems', 'common'])
  const queryClient = useQueryClient()
  const [userCursor, setUserCursor] = useState('')
  const [userHistory, setUserHistory] = useState<string[]>([])
  const [invitationCursor, setInvitationCursor] = useState('')
  const [invitationHistory, setInvitationHistory] = useState<string[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [invitationSearch, setInvitationSearch] = useState('')
  const [userSort, setUserSort] = useState<UserSort>('createdAt')
  const [userDirection, setUserDirection] = useState<SortDirection>('desc')
  const [invitationSort, setInvitationSort] = useState<InvitationSort>('createdAt')
  const [invitationDirection, setInvitationDirection] = useState<SortDirection>('desc')
  const users = useQuery(usersOptions(api, { cursor: userCursor, q: userSearch, sort: userSort, direction: userDirection }))
  const roles = useQuery({ ...rolesOptions(api), enabled: canManage })
  const invitations = useQuery({ ...invitationsOptions(api, { cursor: invitationCursor, q: invitationSearch, sort: invitationSort, direction: invitationDirection }), enabled: canManage })
  const [inviteOpen, setInviteOpen] = useState(false)
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [assignmentUser, setAssignmentUser] = useState<AccessUser | undefined>()
  const [assignmentGeneration, setAssignmentGeneration] = useState(0)
  const assignmentGenerationRef = useRef(0)
  const [revokeTarget, setRevokeTarget] = useState<Invitation | undefined>()
  const [notice, setNotice] = useState<unknown>()

  const revoke = useMutation({
    retry: false,
    mutationFn: async (id: string) => { if (!api.revokeInvitation) throw new Error('missing revokeInvitation'); await api.revokeInvitation(id) },
    onSuccess: () => { setRevokeTarget(undefined); void queryClient.invalidateQueries({ queryKey: ['access', 'invitations'] }) },
    onError: setNotice,
  })
  const resend = useMutation({
    retry: false,
    mutationFn: async (id: string) => { if (!api.resendInvitation) throw new Error('missing resendInvitation'); return api.resendInvitation(id) },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['access', 'invitations'] }),
    onError: setNotice,
  })

  const resetUsersPaging = (value: string) => { setUserSearch(value); setUserCursor(''); setUserHistory([]) }
  const resetInvitationsPaging = (value: string) => { setInvitationSearch(value); setInvitationCursor(''); setInvitationHistory([]) }
  const handleUserSorting: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater([{ id: userSort, desc: userDirection === 'desc' }]) : updater
    const first = next[0]
    setUserSort((first?.id as UserSort | undefined) ?? 'createdAt')
    setUserDirection(first?.desc ? 'desc' : 'asc')
    setUserCursor(''); setUserHistory([])
  }
  const handleInvitationSorting: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater([{ id: invitationSort, desc: invitationDirection === 'desc' }]) : updater
    const first = next[0]
    setInvitationSort((first?.id as InvitationSort | undefined) ?? 'createdAt')
    setInvitationDirection(first?.desc ? 'desc' : 'asc')
    setInvitationCursor(''); setInvitationHistory([])
  }
  const retryUsers = () => void users.refetch()
  const retryRoles = () => void roles.refetch()
  const retryInvitations = () => void invitations.refetch()
  const retryAll = () => { setNotice(undefined); retryUsers(); if (canManage) { retryRoles(); retryInvitations() } }
  const roleList = roles.data?.roles ?? []
  const activeAssignmentUser = assignmentUser ? users.data?.users.find((item) => item.id === assignmentUser.id) ?? assignmentUser : undefined
  const openAssignment = (user: AccessUser) => {
    const next = assignmentGenerationRef.current + 1
    assignmentGenerationRef.current = next
    setAssignmentGeneration(next)
    setAssignmentUser(user)
    setAssignmentOpen(true)
  }

  const userColumns = useMemo<ColumnDef<AccessUser, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => <SortableHeader column={column}>{t('inviteName')}</SortableHeader>,
      cell: ({ row }) => canManage ? <button type="button" className="max-w-56 truncate text-left font-medium" onClick={() => openAssignment(row.original)}>{row.original.name}</button> : <span className="max-w-56 truncate font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <SortableHeader column={column}>{t('inviteEmail')}</SortableHeader>,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
    },
    {
      id: 'roles',
      accessorFn: (user) => user.roles.map((role) => role.name).join(', '),
      header: () => <span>{t('assignedRoles')}</span>,
      cell: ({ row }) => <div className="flex flex-wrap gap-1">{row.original.roles.map((role) => <Badge key={role.id} variant="secondary">{role.name}</Badge>)}</div>,
      enableSorting: false,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <SortableHeader column={column}>{t('createdAt')}</SortableHeader>,
      cell: ({ row }) => <time dateTime={row.original.createdAt}>{formatDate(row.original.createdAt, i18n.language)}</time>,
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => <span>{t('actions')}</span>,
      cell: ({ row }) => canManage ? <Button type="button" variant="ghost" size="sm" onClick={() => openAssignment(row.original)}><Pencil aria-hidden="true" />{t('assignRoles')}</Button> : null,
    },
  ], [canManage, i18n.language, t])

  const invitationColumns = useMemo<ColumnDef<Invitation, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => <SortableHeader column={column}>{t('inviteName')}</SortableHeader>,
      cell: ({ row }) => <span className="max-w-56 truncate font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <SortableHeader column={column}>{t('inviteEmail')}</SortableHeader>,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
    },
    {
      id: 'roles',
      accessorFn: (invitation) => invitation.roles.map((role) => role.name).join(', '),
      header: () => <span>{t('assignedRoles')}</span>,
      cell: ({ row }) => <div className="flex flex-wrap gap-1">{row.original.roles.map((role) => <Badge key={role.id} variant="secondary">{role.name}</Badge>)}</div>,
      enableSorting: false,
    },
    {
      accessorKey: 'locale',
      header: () => <span>{t('emailLanguage')}</span>,
      cell: ({ row }) => <Badge variant="outline">{row.original.locale === 'zh-CN' ? t('common:chinese') : t('common:english')}</Badge>,
      enableSorting: false,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <SortableHeader column={column}>{t('createdAt')}</SortableHeader>,
      cell: ({ row }) => <time dateTime={row.original.createdAt}>{formatDate(row.original.createdAt, i18n.language)}</time>,
    },
    {
      accessorKey: 'expiresAt',
      header: ({ column }) => <SortableHeader column={column}>{t('expiresAt')}</SortableHeader>,
      cell: ({ row }) => {
        const expired = new Date(row.original.expiresAt).getTime() <= Date.now()
        return <div className="flex flex-col items-start gap-1"><time dateTime={row.original.expiresAt}>{formatDate(row.original.expiresAt, i18n.language)}</time><Badge variant={expired ? 'destructive' : 'outline'}>{expired ? t('expired') : t('pending')}</Badge></div>
      },
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => <span>{t('actions')}</span>,
      cell: ({ row }) => <div className="flex flex-wrap justify-end gap-1"><Button type="button" variant="outline" size="sm" disabled={resend.isPending} onClick={() => resend.mutate(row.original.id)}><RefreshCw aria-hidden="true" />{resend.isPending ? t('resending') : t('resend')}</Button><Button type="button" variant="ghost" size="sm" onClick={() => setRevokeTarget(row.original)}><X aria-hidden="true" />{t('revoke')}</Button></div>,
    },
  ], [i18n.language, resend, t])

  if (users.isPending || (canManage && roles.isPending)) return <p role="status">{t('common:loading')}</p>
  if (users.isError) return <AccessError error={users.error} onRetry={retryUsers} />
  if (canManage && roles.isError) return <AccessError error={roles.error} onRetry={retryRoles} />

  return <section className="flex flex-col gap-5" aria-labelledby="users-title">
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h1 id="users-title" className="text-2xl font-semibold tracking-tight">{t('usersTitle')}</h1><p className="text-sm text-muted-foreground">{t('usersDescription')}</p></div>{canManage ? <Button type="button" onClick={() => { setInviteOpen(true); setNotice(undefined) }}><UserPlus aria-hidden="true" />{t('inviteUser')}</Button> : null}</div>
    {notice !== undefined ? <AccessError error={notice} onRetry={retryAll} onReload={retryAll} /> : null}
    <Card>
      <CardHeader><CardTitle className="text-lg">{t('users')}</CardTitle></CardHeader>
      <CardContent>
        <DataTable columns={userColumns} data={users.data.users} search={userSearch} onSearchChange={resetUsersPaging} searchPlaceholder={t('searchUsers')} clearSearchLabel={t('clearSearch')} emptyMessage={userSearch ? t('noSearchResults') : t('noUsers')} sorting={[{ id: userSort, desc: userDirection === 'desc' }]} onSortingChange={handleUserSorting} manualFiltering manualSorting />
        {users.isFetching && !users.isPending ? <p role="status" className="mt-3 text-sm text-muted-foreground">{t('common:loading')}</p> : null}
        <PageNavigation hasPrevious={userHistory.length > 0} hasNext={Boolean(users.data.nextCursor)} loading={users.isFetching} onPrevious={() => { const previous = userHistory[userHistory.length - 1] ?? ''; setUserHistory((current) => current.slice(0, -1)); setUserCursor(previous) }} onNext={() => { if (!users.data.nextCursor) return; setUserHistory((current) => [...current, userCursor]); setUserCursor(users.data.nextCursor) }} t={(key) => t(key as never)} />
      </CardContent>
    </Card>
    {canManage ? <Card>
      <CardHeader><CardTitle className="text-lg">{t('invitations')}</CardTitle><CardDescription>{t('inviteUser')}</CardDescription></CardHeader>
      <CardContent>
        {invitations.isPending ? <p role="status">{t('common:loading')}</p> : invitations.isError ? <AccessError error={invitations.error} onRetry={retryInvitations} /> : <DataTable columns={invitationColumns} data={invitations.data?.invitations ?? []} search={invitationSearch} onSearchChange={resetInvitationsPaging} searchPlaceholder={t('searchInvitations')} clearSearchLabel={t('clearSearch')} emptyMessage={invitationSearch ? t('noSearchResults') : t('noInvitations')} sorting={[{ id: invitationSort, desc: invitationDirection === 'desc' }]} onSortingChange={handleInvitationSorting} manualFiltering manualSorting />}
        {invitations.isFetching && !invitations.isPending ? <p role="status" className="mt-3 text-sm text-muted-foreground">{t('common:loading')}</p> : null}
        {!invitations.isPending && !invitations.isError ? <PageNavigation hasPrevious={invitationHistory.length > 0} hasNext={Boolean(invitations.data?.nextCursor)} loading={invitations.isFetching} onPrevious={() => { const previous = invitationHistory[invitationHistory.length - 1] ?? ''; setInvitationHistory((current) => current.slice(0, -1)); setInvitationCursor(previous) }} onNext={() => { if (!invitations.data?.nextCursor) return; setInvitationHistory((current) => [...current, invitationCursor]); setInvitationCursor(invitations.data.nextCursor) }} t={(key) => t(key as never)} /> : null}
      </CardContent>
    </Card> : null}
    <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
      <DialogContent forceMount closeLabel={t('common:close')} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><InvitationForm open={inviteOpen} api={api} roles={roleList} onDone={() => { setInviteOpen(false); void queryClient.invalidateQueries({ queryKey: ['access', 'invitations'] }) }} /></DialogContent>
    </Dialog>
    <UserAssignmentDialog key={activeAssignmentUser?.id ?? 'none'} open={assignmentOpen} user={activeAssignmentUser} roles={roleList} api={api} canManage={canManage} assignmentGeneration={assignmentGeneration} onClose={() => setAssignmentOpen(false)} onDone={(_userID, generation) => { if (generation !== assignmentGenerationRef.current) return; setAssignmentOpen(false); void queryClient.invalidateQueries({ queryKey: ['access', 'users'] }); void queryClient.invalidateQueries({ queryKey: ['auth', 'current-user'] }) }} onReload={async () => {
      if (!activeAssignmentUser) return
      const result = await users.refetch()
      const refreshed = result.data?.users.find((item) => item.id === activeAssignmentUser.id)
      if (refreshed) {
        setAssignmentUser(refreshed)
        useAccessDraftStore.getState().setAssignment(refreshed.id, undefined)
      }
    }} />
    <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => { if (!open) setRevokeTarget(undefined) }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('revoke')}</AlertDialogTitle><AlertDialogDescription>{t('revokeConfirm', { email: revokeTarget?.email ?? '' })}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel><AlertDialogAction disabled={revoke.isPending} onClick={() => { if (revokeTarget) revoke.mutate(revokeTarget.id) }}>{t('revoke')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>
}

function formatDate(value: string, language: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date)
}

function PageNavigation({ hasPrevious, hasNext, loading, onPrevious, onNext, t }: { hasPrevious: boolean; hasNext: boolean; loading: boolean; onPrevious: () => void; onNext: () => void; t: (key: string) => string }) {
  return <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t('pagination')}>
    <Button type="button" variant="outline" size="sm" disabled={!hasPrevious || loading} onClick={onPrevious}><ChevronLeft aria-hidden="true" />{t('previousPage')}</Button>
    <Button type="button" variant="outline" size="sm" disabled={!hasNext || loading} onClick={onNext}>{t('nextPage')}<ChevronRight aria-hidden="true" /></Button>
  </nav>
}

function UserAssignmentDialog({ api, user, roles, canManage = true, open, assignmentGeneration, onClose, onDone, onReload }: { api: ApiClient; user?: AccessUser; roles: Role[]; canManage?: boolean; open: boolean; assignmentGeneration: number; onClose: () => void; onDone: (userID: string, generation: number) => void; onReload: () => Promise<void> }) {
  const { t } = useTranslation(['access', 'problems', 'common'])
  const queryClient = useQueryClient()
  const assignment = useAccessDraftStore((state) => user ? state.assignments[user.id] : undefined)
  const setAssignment = useAccessDraftStore((state) => state.setAssignment)
  const [error, setError] = useState<unknown>()
  const initialRoles = useMemo(() => user?.roles.map((role) => role.id).slice().sort() ?? [], [user])
  useEffect(() => {
    if (!open) return
    if (!user || assignment) return
    setAssignment(user.id, { userID: user.id, authVersion: user.authVersion, roleIDs: initialRoles, submitting: false, conflict: false, validationError: false, invalidRoleSelection: false })
  }, [assignment, initialRoles, open, setAssignment, user])
  useEffect(() => {
    if (!user || !assignment || assignment.authVersion === user.authVersion || assignment.conflict) return
    setAssignment(user.id, { ...assignment, conflict: true })
  }, [assignment, setAssignment, user])
  const current = assignment ?? { userID: user?.id ?? '', authVersion: user?.authVersion ?? 0, roleIDs: initialRoles, submitting: false, conflict: false, validationError: false }
  type Submission = { ownerID?: string; userID: string; submissionID: string }
  const updateDraft = (patch: Partial<typeof current>, submission?: Submission): boolean => {
    if (!user) return false
    const state = useAccessDraftStore.getState()
    const existing = state.assignments[user.id]
    if (submission && (state.ownerID !== submission.ownerID || existing?.userID !== submission.userID || existing?.submissionID !== submission.submissionID)) return false
    setAssignment(user.id, { ...(existing ?? current), ...patch })
    return true
  }
  const update = (patch: Partial<typeof current>) => { setError(undefined); updateDraft(patch) }
  const resetDraft = () => {
    setError(undefined)
    if (user) setAssignment(user.id, { userID: user.id, authVersion: user.authVersion, roleIDs: initialRoles, submitting: false, conflict: false, validationError: false, invalidRoleSelection: false })
  }
  const beginSubmission = (): Submission => {
    const state = useAccessDraftStore.getState()
    const submission = { ownerID: state.ownerID, userID: user?.id ?? '', submissionID: nextDraftSubmissionID() }
    updateDraft({ ...(state.assignments[user?.id ?? ''] ?? current), submissionID: submission.submissionID, submitting: false, conflict: false })
    return submission
  }
  const mutation = useMutation({
    retry: false,
    mutationFn: async (submission: Submission) => {
      const state = useAccessDraftStore.getState()
      const draft = user ? state.assignments[user.id] : undefined
      if (!user || !draft || state.ownerID !== submission.ownerID || draft.userID !== submission.userID || draft.submissionID !== submission.submissionID) throw new Error('stale draft')
      if (draft.roleIDs.length === 0) { updateDraft({ validationError: true, invalidRoleSelection: false }, submission); throw new Error('invalid roles') }
      const availableRoleIDs = new Set(roles.map((role) => role.id))
      if (draft.roleIDs.some((roleID) => !availableRoleIDs.has(roleID))) {
        updateDraft({ validationError: true, invalidRoleSelection: true }, submission)
        throw new Error('invalid roles')
      }
      if (!updateDraft({ submitting: true, validationError: false, invalidRoleSelection: false, conflict: false }, submission)) throw new Error('stale draft')
      if (!api.replaceUserRoles) throw new Error('missing replaceUserRoles')
      return api.replaceUserRoles(user.id, { roleIds: draft.roleIDs, authVersion: draft.authVersion })
    },
    onSuccess: (_saved, submission) => {
      const state = useAccessDraftStore.getState()
      if (state.ownerID !== submission.ownerID) return
      void queryClient.invalidateQueries({ queryKey: ['access', 'users'] })
      void queryClient.invalidateQueries({ queryKey: ['auth', 'current-user'] })
      const existing = user ? state.assignments[user.id] : undefined
      if (!user || existing?.userID !== submission.userID || existing?.submissionID !== submission.submissionID) return
      setError(undefined)
      setAssignment(user.id, undefined)
      onDone(user.id, assignmentGeneration)
    },
    onError: (error, submission) => {
      if (!submission || !updateDraft({ submitting: false }, submission)) return
      if (isStaleRevision(error)) updateDraft({ conflict: true }, submission)
      else if (!(error instanceof Error && (error.message === 'invalid roles' || error.message === 'stale draft'))) setError(error)
    },
  })
  if (!user || !canManage) return null
  const hasChanges = !sameRoleIDs(current.roleIDs, initialRoles)
  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose() }}>
    <DialogContent forceMount closeLabel={t('common:close')} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>{t('assignRoles')}</DialogTitle><DialogDescription>{user.name} · {user.email}</DialogDescription></DialogHeader>
      {error !== undefined ? <AccessError error={error} /> : null}
      {current.conflict ? <AccessError error={new ApiProblemError({ type: '/problems/stale-revision', title: 'stale revision', status: 409, code: 'stale_revision' })} descriptionOverride={t('draftConflictDescription')} reloadLabel={t('reloadLatest')} onReload={() => void onReload()} /> : null}
      <fieldset className="flex flex-col gap-2" aria-describedby={current.validationError ? 'assignment-roles-error' : undefined}>
        <legend className="text-sm font-medium">{t('assignedRoles')}</legend>
        {roles.map((role) => <label key={role.id} className="flex items-center gap-3 rounded-md border p-3 text-sm"><Checkbox checked={current.roleIDs.includes(role.id)} onCheckedChange={(value) => update({ roleIDs: value === true ? [...current.roleIDs, role.id] : current.roleIDs.filter((id) => id !== role.id), validationError: false, invalidRoleSelection: false })} aria-label={role.name} disabled={current.submitting || mutation.isPending} />{role.name}</label>)}
        {current.validationError ? <FieldError id="assignment-roles-error">{current.invalidRoleSelection ? t('invalidRoleSelection') : t('requiredRole')}</FieldError> : null}
      </fieldset>
      <DialogFooter><Button type="button" variant="ghost" onClick={resetDraft}>{t('common:reset')}</Button><DialogClose asChild><Button type="button" variant="outline">{t('common:cancel')}</Button></DialogClose><Button type="button" disabled={current.submitting || mutation.isPending || current.roleIDs.length === 0 || !hasChanges} onClick={() => { if (!current.submitting && !mutation.isPending) mutation.mutate(beginSubmission()) }}><Save aria-hidden="true" />{current.submitting || mutation.isPending ? t('saving') : t('saveAssignments')}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

function sameRoleIDs(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const sortedLeft = left.slice().sort()
  const sortedRight = right.slice().sort()
  return sortedLeft.every((id, index) => id === sortedRight[index])
}

function isStaleRevision(error: unknown): boolean {
  return error instanceof ApiProblemError && (error.problem.code === 'stale_revision' || error.problem.type === '/problems/stale-revision')
}

function InvitationForm({ api, roles, open, onDone }: { api: ApiClient; roles: Role[]; open: boolean; onDone: () => void }) {
  const { t, i18n } = useTranslation(['access', 'problems', 'common'])
  const queryClient = useQueryClient()
  const invitation = useAccessDraftStore((state) => state.invitation)
  const setInvitation = useAccessDraftStore((state) => state.setInvitation)
  const [error, setError] = useState<unknown>()
  const currentLocale: 'en' | 'zh-CN' = i18n.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
  useEffect(() => {
    if (open && !invitation) setInvitation({ name: '', email: '', locale: currentLocale, roleIDs: [], submitting: false })
  }, [currentLocale, invitation, open, setInvitation])
  const current = invitation ?? { name: '', email: '', locale: currentLocale, roleIDs: [], submitting: false }
  type Submission = { ownerID?: string; submissionID: string }
  const updateDraft = (patch: Partial<typeof current>, submission?: Submission): boolean => {
    const state = useAccessDraftStore.getState()
    const existing = state.invitation
    if (submission && (state.ownerID !== submission.ownerID || existing?.submissionID !== submission.submissionID)) return false
    setInvitation({ ...(existing ?? current), ...patch })
    return true
  }
  const update = (patch: Partial<typeof current>) => { setError(undefined); updateDraft(patch) }
  const resetDraft = () => { setError(undefined); setInvitation({ name: '', email: '', locale: currentLocale, roleIDs: [], submitting: false }) }
  const beginSubmission = (): Submission => {
    const state = useAccessDraftStore.getState()
    const submission = { ownerID: state.ownerID, submissionID: nextDraftSubmissionID() }
    updateDraft({ ...(state.invitation ?? current), submissionID: submission.submissionID, submitting: false })
    return submission
  }
  const mutation = useMutation({
    retry: false,
    mutationFn: async (submission: Submission) => {
      const state = useAccessDraftStore.getState()
      const draft = state.invitation
      if (!draft || state.ownerID !== submission.ownerID || draft.submissionID !== submission.submissionID) throw new Error('stale draft')
      if (!draft.name.trim()) { updateDraft({ validationError: 'name' }, submission); throw new Error('validation') }
      if (!draft.email.trim()) { updateDraft({ validationError: 'email' }, submission); throw new Error('validation') }
      if (draft.roleIDs.length === 0) { updateDraft({ validationError: 'roles' }, submission); throw new Error('validation') }
      const availableRoleIDs = new Set(roles.map((role) => role.id))
      if (draft.roleIDs.some((roleID) => !availableRoleIDs.has(roleID))) { updateDraft({ validationError: 'invalidRoles' }, submission); throw new Error('validation') }
      if (!updateDraft({ submitting: true, validationError: undefined }, submission)) throw new Error('stale draft')
      if (!api.createInvitation) throw new Error('missing createInvitation')
      return api.createInvitation({ name: draft.name, email: draft.email, locale: draft.locale, roleIds: draft.roleIDs })
    },
    onSuccess: (_saved, submission) => {
      const state = useAccessDraftStore.getState()
      if (state.ownerID !== submission.ownerID) return
      void queryClient.invalidateQueries({ queryKey: ['access', 'invitations'] })
      if (state.invitation?.submissionID !== submission.submissionID) return
      setError(undefined)
      setInvitation(undefined)
      onDone()
    },
    onError: (error, submission) => {
      if (!submission || !updateDraft({ submitting: false }, submission)) return
      if (!(error instanceof Error && (error.message === 'validation' || error.message === 'stale draft'))) setError(error)
    },
  })
  return <>
    <DialogHeader><DialogTitle>{t('inviteUser')}</DialogTitle><DialogDescription>{t('usersDescription')}</DialogDescription></DialogHeader>
    {error !== undefined ? <AccessError error={error} /> : null}
    <form className="flex flex-col gap-5" noValidate onSubmit={(event) => { event.preventDefault(); if (!current.submitting && !mutation.isPending) mutation.mutate(beginSubmission()) }}>
      <FieldGroup>
        <Field data-invalid={current.validationError === 'name'}><FieldLabel htmlFor="invite-name">{t('inviteName')}</FieldLabel><Input id="invite-name" value={current.name} onChange={(event) => update({ name: event.target.value, validationError: undefined })} aria-invalid={current.validationError === 'name'} autoComplete="name" disabled={current.submitting || mutation.isPending} />{current.validationError === 'name' ? <FieldError>{t('problems:fields.invalidName')}</FieldError> : null}</Field>
        <Field data-invalid={current.validationError === 'email'}><FieldLabel htmlFor="invite-email">{t('inviteEmail')}</FieldLabel><Input id="invite-email" value={current.email} onChange={(event) => update({ email: event.target.value, validationError: undefined })} aria-invalid={current.validationError === 'email'} type="email" autoComplete="email" disabled={current.submitting || mutation.isPending} />{current.validationError === 'email' ? <FieldError>{t('problems:fields.invalidEmail')}</FieldError> : null}</Field>
        <Field><FieldLabel htmlFor="invite-locale">{t('inviteLocale')}</FieldLabel><Select value={current.locale} onValueChange={(value) => update({ locale: value as 'en' | 'zh-CN' })} disabled={current.submitting || mutation.isPending}><SelectTrigger id="invite-locale"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="en">{t('common:english')}</SelectItem><SelectItem value="zh-CN">{t('common:chinese')}</SelectItem></SelectGroup></SelectContent></Select></Field>
        <fieldset className="flex flex-col gap-2" aria-describedby={current.validationError === 'roles' || current.validationError === 'invalidRoles' ? 'invite-roles-error' : undefined}>
          <legend className="text-sm font-medium">{t('assignedRoles')}</legend>
          {roles.map((role) => (
            <label key={role.id} className="flex items-center gap-3 rounded-md border p-3 text-sm">
              <Checkbox
                checked={current.roleIDs.includes(role.id)}
                onCheckedChange={(value) => update({
                  roleIDs: value === true
                    ? [...current.roleIDs, role.id]
                    : current.roleIDs.filter((id) => id !== role.id),
                  validationError: undefined,
                })}
                aria-label={role.name}
                disabled={current.submitting || mutation.isPending}
              />
              {role.name}
            </label>
          ))}
          {current.validationError === 'roles' || current.validationError === 'invalidRoles' ? <FieldError id="invite-roles-error">{current.validationError === 'invalidRoles' ? t('invalidRoleSelection') : t('requiredRole')}</FieldError> : null}
        </fieldset>
      </FieldGroup>
      <DialogFooter><Button type="button" variant="ghost" onClick={resetDraft}>{t('common:reset')}</Button><DialogClose asChild><Button type="button" variant="outline">{t('common:cancel')}</Button></DialogClose><Button type="submit" disabled={current.submitting || mutation.isPending}><Mail aria-hidden="true" />{current.submitting || mutation.isPending ? t('saving') : t('sendInvitation')}</Button></DialogFooter>
    </form>
  </>
}
