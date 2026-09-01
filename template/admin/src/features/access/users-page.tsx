import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Mail, RefreshCw, Save, UserPlus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { type ApiClient } from '@/shared/api/client'
import type { Role } from '@/shared/api/contracts'
import { AccessError } from './access-error'
import { invitationsOptions, rolesOptions, usersOptions } from './queries'

export function UsersPage({ api, canManage }: { api: ApiClient; canManage: boolean }) {
  const { t } = useTranslation(['access', 'problems', 'common'])
  const queryClient = useQueryClient()
  const [userCursor, setUserCursor] = useState('')
  const [userHistory, setUserHistory] = useState<string[]>([])
  const [invitationCursor, setInvitationCursor] = useState('')
  const [invitationHistory, setInvitationHistory] = useState<string[]>([])
  const users = useQuery(usersOptions(api, userCursor))
  const roles = useQuery({ ...rolesOptions(api), enabled: canManage })
  const invitations = useQuery({ ...invitationsOptions(api, invitationCursor), enabled: canManage })
  const [inviteOpen, setInviteOpen] = useState(false)
  const [notice, setNotice] = useState<unknown>()
  const revoke = useMutation({ retry: false, mutationFn: async (id: string) => { if (!api.revokeInvitation) throw new Error('missing revokeInvitation'); await api.revokeInvitation(id) }, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['access', 'invitations'] }), onError: setNotice })
  const resend = useMutation({ retry: false, mutationFn: async (id: string) => { if (!api.resendInvitation) throw new Error('missing resendInvitation'); return api.resendInvitation(id) }, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['access', 'invitations'] }), onError: setNotice })
  const retryUsers = () => void users.refetch()
  const retryRoles = () => void roles.refetch()
  const retryInvitations = () => void invitations.refetch()
  const retryAll = () => { setNotice(undefined); retryUsers(); if (canManage) { retryRoles(); retryInvitations() } }
  if (users.isPending || (canManage && roles.isPending)) return <p role="status">{t('common:loading')}</p>
  if (users.isError) return <AccessError error={users.error} onRetry={retryUsers} />
  if (canManage && roles.isError) return <AccessError error={roles.error} onRetry={retryRoles} />
  const roleList = roles.data?.roles ?? []
  const translate = (key: string) => t(key as never)
  return <section className="flex flex-col gap-5" aria-labelledby="users-title">
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h1 id="users-title" className="text-2xl font-semibold tracking-tight">{t('usersTitle')}</h1><p className="text-sm text-muted-foreground">{t('usersDescription')}</p></div>{canManage && <Button type="button" onClick={() => { setInviteOpen((current) => !current); setNotice(undefined) }}><UserPlus aria-hidden="true" />{t('inviteUser')}</Button>}</div>
    {notice !== undefined && <AccessError error={notice} onRetry={retryAll} onReload={retryAll} />}
    {inviteOpen && canManage && <InvitationForm api={api} roles={roleList} onDone={() => { setInviteOpen(false); void queryClient.invalidateQueries({ queryKey: ['access', 'invitations'] }) }} onError={setNotice} />}
    <Card><CardHeader><CardTitle className="text-lg">{t('users')}</CardTitle></CardHeader><CardContent><div className="flex flex-col gap-4">{users.data.users.map((user) => <UserAssignment key={`${user.id}:${user.authVersion}:${user.roles.map((role) => role.id).slice().sort().join(',')}`} api={api} user={user} roles={roleList} canManage={canManage} onDone={() => { void queryClient.invalidateQueries({ queryKey: ['access', 'users'] }); void queryClient.invalidateQueries({ queryKey: ['auth', 'current-user'] }) }} onError={setNotice} />)}{users.data.users.length === 0 && <p className="text-sm text-muted-foreground">{t('noUsers')}</p>}</div>{(userHistory.length > 0 || users.data.nextCursor) && <PageNavigation hasPrevious={userHistory.length > 0} hasNext={Boolean(users.data.nextCursor)} loading={users.isFetching} onPrevious={() => { const previous = userHistory[userHistory.length - 1] ?? ''; setUserHistory((current) => current.slice(0, -1)); setUserCursor(previous) }} onNext={() => { if (!users.data.nextCursor) return; setUserHistory((current) => [...current, userCursor]); setUserCursor(users.data.nextCursor) }} t={translate} />}</CardContent></Card>
    {canManage && <Card><CardHeader><CardTitle className="text-lg">{t('invitations')}</CardTitle><CardDescription>{t('inviteUser')}</CardDescription></CardHeader><CardContent><div className="flex flex-col divide-y">{invitations.isPending ? <p role="status">{t('common:loading')}</p> : invitations.isError ? <AccessError error={invitations.error} onRetry={retryInvitations} /> : invitations.data.invitations.map((invitation) => <div key={invitation.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate font-medium">{invitation.name}</p><p className="truncate text-sm text-muted-foreground">{invitation.email}</p><p className="text-xs text-muted-foreground">{invitation.roles.map((role) => role.name).join(', ')}</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={resend.isPending} onClick={() => resend.mutate(invitation.id)}><RefreshCw aria-hidden="true" />{t('resend')}</Button><Button type="button" variant="ghost" size="sm" disabled={revoke.isPending} onClick={() => { if (window.confirm(t('revokeConfirm'))) revoke.mutate(invitation.id) }}><X aria-hidden="true" />{t('revoke')}</Button></div></div>)}{!invitations.isPending && !invitations.isError && invitations.data.invitations.length === 0 && <p className="text-sm text-muted-foreground">{t('noInvitations')}</p>}</div>{!invitations.isPending && !invitations.isError && (invitationHistory.length > 0 || invitations.data.nextCursor) && <PageNavigation hasPrevious={invitationHistory.length > 0} hasNext={Boolean(invitations.data.nextCursor)} loading={invitations.isFetching} onPrevious={() => { const previous = invitationHistory[invitationHistory.length - 1] ?? ''; setInvitationHistory((current) => current.slice(0, -1)); setInvitationCursor(previous) }} onNext={() => { if (!invitations.data.nextCursor) return; setInvitationHistory((current) => [...current, invitationCursor]); setInvitationCursor(invitations.data.nextCursor) }} t={translate} />}</CardContent></Card>}
  </section>
}

function PageNavigation({ hasPrevious, hasNext, loading, onPrevious, onNext, t }: { hasPrevious: boolean; hasNext: boolean; loading: boolean; onPrevious: () => void; onNext: () => void; t: (key: string) => string }) {
  return <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t('pagination')}>
    <Button type="button" variant="outline" size="sm" disabled={!hasPrevious || loading} onClick={onPrevious}><ChevronLeft aria-hidden="true" />{t('previousPage')}</Button>
    <Button type="button" variant="outline" size="sm" disabled={!hasNext || loading} onClick={onNext}>{t('nextPage')}<ChevronRight aria-hidden="true" /></Button>
  </nav>
}

type AccessUser = { id: string; name: string; email: string; createdAt: string; authVersion: number; roles: Role[] }

function UserAssignment({ api, user, roles, canManage, onDone, onError }: { api: ApiClient; user: AccessUser; roles: Role[]; canManage: boolean; onDone: () => void; onError: (error: unknown) => void }) {
  const { t } = useTranslation(['access', 'problems'])
  const serverRoleIDs = useMemo(() => user.roles.map((role) => role.id).slice().sort(), [user.roles])
  const [selected, setSelected] = useState<string[]>(serverRoleIDs)
  const mutation = useMutation({ retry: false, mutationFn: async () => { if (!api.replaceUserRoles) throw new Error('missing replaceUserRoles'); return api.replaceUserRoles(user.id, { roleIds: selected, authVersion: user.authVersion }) }, onSuccess: onDone, onError })
  const dirty = useMemo(() => selected.slice().sort().join(',') !== serverRoleIDs.join(','), [selected, serverRoleIDs])
  return <div className="rounded-md border p-4"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="truncate font-medium">{user.name}</p><p className="truncate text-sm text-muted-foreground">{user.email}</p></div><span className="text-xs text-muted-foreground">{user.roles.map((role) => role.name).join(', ')}</span></div>{canManage && <fieldset className="mt-4 flex flex-col gap-2"><legend className="text-sm font-medium">{t('assignedRoles')}</legend>{roles.map((role) => <label key={role.id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={selected.includes(role.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id))} />{role.name}</label>)}{selected.length === 0 && <FieldError>{t('requiredRole')}</FieldError>}<Button type="button" className="mt-2 self-start" size="sm" disabled={!dirty || selected.length === 0 || mutation.isPending} onClick={() => mutation.mutate()}><Save aria-hidden="true" />{mutation.isPending ? t('saving') : t('saveAssignments')}</Button></fieldset>}</div>
}

function InvitationForm({ api, roles, onDone, onError }: { api: ApiClient; roles: Role[]; onDone: () => void; onError: (error: unknown) => void }) {
  const { t, i18n } = useTranslation(['access', 'problems'])
  const locale: 'en' | 'zh-CN' = i18n.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [roleIDs, setRoleIDs] = useState<string[]>([])
  const [error, setError] = useState<string>()
  const mutation = useMutation({ retry: false, mutationFn: async () => { if (!name.trim() || !email.trim() || roleIDs.length === 0) { setError(t('requiredRole')); throw new Error('validation') }; if (!api.createInvitation) throw new Error('missing createInvitation'); return api.createInvitation({ name, email, locale, roleIds: roleIDs as string[] }) }, onSuccess: onDone, onError: (value) => { if (!(value instanceof Error && value.message === 'validation')) onError(value) } })
  return <Card><CardHeader><CardTitle>{t('inviteUser')}</CardTitle></CardHeader><CardContent><form className="flex flex-col gap-5" noValidate onSubmit={(event) => { event.preventDefault(); setError(undefined); mutation.mutate() }}><FieldGroup><Field><FieldLabel htmlFor="invite-name">{t('inviteName')}</FieldLabel><Input id="invite-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></Field><Field><FieldLabel htmlFor="invite-email">{t('inviteEmail')}</FieldLabel><Input id="invite-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" /></Field><Field><FieldLabel htmlFor="invite-locale">{t('inviteLocale')}</FieldLabel><select id="invite-locale" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={locale} disabled><option value="en">English</option><option value="zh-CN">简体中文</option></select></Field><fieldset className="flex flex-col gap-2"><legend className="text-sm font-medium">{t('assignedRoles')}</legend>{roles.map((role) => <label key={role.id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={roleIDs.includes(role.id)} onChange={(event) => setRoleIDs((current) => event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id))} />{role.name}</label>)}{error && <FieldError>{error === 'validation' ? t('requiredRole') : error}</FieldError>}</fieldset></FieldGroup><Button type="submit" disabled={mutation.isPending}><Mail aria-hidden="true" />{mutation.isPending ? t('saving') : t('sendInvitation')}</Button></form></CardContent></Card>
}
