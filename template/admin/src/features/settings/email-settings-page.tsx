import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, MailCheck, Save, Send, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiProblemError, type ApiClient } from '@/shared/api/client'
import type { EmailSettings } from '@/shared/api/contracts'
import { AccessError } from '@/features/access/access-error'
import { useAccessDraftStore, type EmailSettingsDraft } from '@/features/access/drafts'

const emptyDraft: EmailSettingsDraft = {
  host: '', port: 587, security: 'starttls', authentication: false, username: '', password: '', clearPassword: false, passwordSet: false, fromAddress: '', fromName: 'Temvia', revision: 0, configured: false, submitting: false,
}

export function EmailSettingsPage({ api, defaultRecipient, canWrite = true }: { api: ApiClient; defaultRecipient: string; canWrite?: boolean }) {
  const { t } = useTranslation(['settings', 'common', 'problems', 'access'])
  const queryClient = useQueryClient()
  const draft = useAccessDraftStore((state) => state.emailSettings)
  const setDraft = useAccessDraftStore((state) => state.setEmailSettings)
  const [error, setError] = useState<unknown>()
  const query = useQuery({ queryKey: ['settings', 'email'], queryFn: ({ signal }) => api.getEmailSettings ? api.getEmailSettings(signal) : Promise.reject(new Error('missing getEmailSettings')), retry: false })

  useEffect(() => {
    if (!query.data || draft) return
    setDraft(fromSettings(query.data))
  }, [draft, query.data, setDraft])

  const current = draft ?? (query.data ? fromSettings(query.data) : emptyDraft)
  const save = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!api.saveEmailSettings) throw new Error('missing saveEmailSettings')
      if (!current.defaultLocale) throw new Error('default locale required')
      setDraft({ ...current, submitting: true })
      return api.saveEmailSettings({ host: current.host, port: current.port, security: current.security, username: current.username, password: current.password || undefined, clearPassword: current.clearPassword, fromAddress: current.fromAddress, fromName: current.fromName, defaultLocale: current.defaultLocale, revision: current.revision })
    },
    onSuccess: (saved) => { setError(undefined); setDraft({ ...fromSettings(saved), password: '', submitting: false }); void queryClient.invalidateQueries({ queryKey: ['settings', 'email'] }) },
    onError: (value) => { setDraft({ ...current, submitting: false }); setError(value) },
  })
  const test = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!api.testEmailSettings) throw new Error('missing testEmailSettings')
      if (!current.defaultLocale) throw new Error('default locale required')
      return api.testEmailSettings({ host: current.host, port: current.port, security: current.security, username: current.username, password: current.password || undefined, clearPassword: current.clearPassword, fromAddress: current.fromAddress, fromName: current.fromName, defaultLocale: current.defaultLocale, revision: current.revision })
    },
    onSuccess: () => setError(undefined),
    onError: setError,
  })
  const reloadLatest = async () => {
    const result = await query.refetch()
    if (result.data) {
      setDraft(fromSettings(result.data))
      setError(undefined)
    }
  }
  if (query.isPending) return <p role="status">{t('common:loading')}</p>
  if (query.isError) return <AccessError error={query.error} onRetry={() => void query.refetch()} />
  const update = (patch: Partial<EmailSettingsDraft>) => { setError(undefined); setDraft({ ...current, ...patch }) }
  const busy = save.isPending || test.isPending
  const disabled = busy || !canWrite
  return <section className="flex max-w-3xl flex-col gap-5" aria-labelledby="settings-title">
    <div><h1 id="settings-title" className="text-2xl font-semibold tracking-tight">{t('title')}</h1><p className="text-sm text-muted-foreground">{t('description')}</p></div>
    {error !== undefined ? <AccessError error={error} onReload={isStaleSettingsError(error) ? () => void reloadLatest() : undefined} reloadLabel={t('access:reloadLatest')} /> : null}
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><MailCheck aria-hidden="true" />{t('email.title')}</CardTitle><CardDescription>{t('email.description')}</CardDescription></CardHeader>
      <CardContent><form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); if (!busy) save.mutate() }} noValidate>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]"><Field><FieldLabel htmlFor="smtp-host">{t('email.host')}</FieldLabel><Input id="smtp-host" value={current.host} onChange={(event) => update({ host: event.target.value })} disabled={disabled} /></Field><Field><FieldLabel htmlFor="smtp-port">{t('email.port')}</FieldLabel><Input id="smtp-port" type="number" min={1} max={65535} value={current.port} onChange={(event) => update({ port: Number(event.target.value) })} disabled={disabled} /></Field></div>
          <Field><FieldLabel htmlFor="smtp-security">{t('email.security')}</FieldLabel><Select value={current.security} onValueChange={(value) => update({ security: value as EmailSettingsDraft['security'] })} disabled={disabled}><SelectTrigger id="smtp-security"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t('email.securityNone')}</SelectItem><SelectItem value="starttls">{t('email.securityStartTLS')}</SelectItem><SelectItem value="tls">{t('email.securityTLS')}</SelectItem></SelectContent></Select></Field>
          <fieldset className="flex flex-col gap-3 rounded-md border p-4"><legend className="px-1 text-sm font-medium">{t('email.authentication')}</legend><label className="flex items-start gap-3 text-sm"><Checkbox id="smtp-authentication" aria-label={t('email.useAuthentication')} checked={current.authentication} onCheckedChange={(value) => update(value === true ? { authentication: true, clearPassword: false } : { authentication: false, username: '', password: '', clearPassword: current.passwordSet })} disabled={disabled} /><span><span className="flex items-center gap-2 font-medium"><KeyRound aria-hidden="true" />{t('email.useAuthentication')}</span><span className="block text-muted-foreground">{t('email.authenticationDescription')}</span></span></label><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="smtp-username">{t('email.username')}</FieldLabel><Input id="smtp-username" value={current.username} onChange={(event) => update({ username: event.target.value })} disabled={disabled || !current.authentication} /></Field><Field><FieldLabel htmlFor="smtp-password">{current.passwordSet ? t('email.passwordReplace') : t('email.password')}</FieldLabel><div className="flex gap-2"><Input id="smtp-password" className="min-w-0" type="password" autoComplete="new-password" value={current.password} onChange={(event) => update({ password: event.target.value, clearPassword: false })} disabled={disabled || !current.authentication} />{current.passwordSet && current.authentication && !current.clearPassword ? <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={t('email.clearPassword')} title={t('email.clearPassword')} onClick={() => update({ password: '', clearPassword: true })} disabled={disabled}><Trash2 aria-hidden="true" /></Button> : null}</div>{current.clearPassword ? <FieldError>{t('email.passwordCleared')}</FieldError> : null}</Field></div></fieldset>
          <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="smtp-from-address">{t('email.fromAddress')}</FieldLabel><Input id="smtp-from-address" type="email" value={current.fromAddress} onChange={(event) => update({ fromAddress: event.target.value })} disabled={disabled} /></Field><Field><FieldLabel htmlFor="smtp-from-name">{t('email.fromName')}</FieldLabel><Input id="smtp-from-name" value={current.fromName} onChange={(event) => update({ fromName: event.target.value })} disabled={disabled} /></Field></div>
          <Field><FieldLabel htmlFor="smtp-default-locale">{t('email.defaultLocale')}</FieldLabel><Select value={current.defaultLocale ?? ''} onValueChange={(value) => update({ defaultLocale: value as 'en' | 'zh-CN' })} disabled={disabled}><SelectTrigger id="smtp-default-locale"><SelectValue placeholder={t('email.chooseLocale')} /></SelectTrigger><SelectContent><SelectItem value="zh-CN">{t('common:chinese')}</SelectItem><SelectItem value="en">{t('common:english')}</SelectItem></SelectContent></Select></Field>
          <p className="text-sm text-muted-foreground">{t('email.testRecipientHint', { recipient: defaultRecipient })}</p>
        </FieldGroup>
        <div className="flex flex-wrap justify-end gap-2">{canWrite ? <><Button type="button" variant="outline" disabled={disabled} onClick={() => { if (!current.defaultLocale) { setError(new Error('default locale required')); return }; test.mutate() }}><Send aria-hidden="true" data-icon="inline-start" />{test.isPending ? t('email.testing') : t('email.sendTest')}</Button><Button type="submit" disabled={disabled || !current.defaultLocale}><Save aria-hidden="true" data-icon="inline-start" />{save.isPending ? t('common:saving') : t('common:save')}</Button></> : null}</div>
      </form></CardContent>
    </Card>
  </section>
}

function isStaleSettingsError(error: unknown): boolean {
  return error instanceof ApiProblemError && (error.problem.code === 'stale_revision' || error.problem.type === '/problems/stale-revision')
}

function fromSettings(settings: EmailSettings): EmailSettingsDraft {
  const passwordSet = settings.passwordSet
  return { host: settings.host ?? '', port: settings.port ?? 587, security: settings.security ?? 'starttls', authentication: Boolean(settings.username || passwordSet), username: settings.username ?? '', password: '', clearPassword: false, passwordSet, fromAddress: settings.fromAddress ?? '', fromName: settings.fromName ?? '', defaultLocale: settings.defaultLocale, revision: settings.revision, configured: settings.configured, submitting: false }
}
