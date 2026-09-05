import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, MailCheck, Save, Send, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiProblemError, type ApiClient } from '@/shared/api/client'
import type { EmailSettings } from '@/shared/api/contracts'
import { translateProblemWithFields } from '@/shared/api/problems'
import { notifyRequestError, notifySuccess, useRequestErrorToast } from '@/shared/feedback'
import { useAccessDraftStore, type EmailSettingsDraft } from '@/features/access/drafts'

const emptyDraft: EmailSettingsDraft = {
  host: '', port: 587, security: 'starttls', authentication: false, username: '', password: '', clearPassword: false, passwordSet: false, fromAddress: '', fromName: 'Temvia', revision: 0, configured: false, submitting: false, conflict: false,
}

export function EmailSettingsPage({ api, canWrite = true }: { api: ApiClient; canWrite?: boolean }) {
  const { t } = useTranslation(['settings', 'common', 'problems', 'access'])
  const queryClient = useQueryClient()
  const draft = useAccessDraftStore((state) => state.emailSettings)
  const setDraft = useAccessDraftStore((state) => state.setEmailSettings)
  const [testDialogOpen, setTestDialogOpen] = useState(false)
  const [testRecipient, setTestRecipient] = useState('')
  const [testRecipientError, setTestRecipientError] = useState(false)
  const [localeError, setLocaleError] = useState(false)
  const query = useQuery({ queryKey: ['settings', 'email'], queryFn: ({ signal }) => api.getEmailSettings ? api.getEmailSettings(signal) : Promise.reject(new Error('missing getEmailSettings')), retry: false })
  useRequestErrorToast(query.error, query.isError, t, { title: t('email.readUnavailableTitle'), description: t('email.readUnavailableDescription') })

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
    onSuccess: (saved) => {
      setDraft({ ...fromSettings(saved), password: '', submitting: false, conflict: false })
      setLocaleError(false)
      notifySuccess(t('email.saveSuccess'))
      void queryClient.invalidateQueries({ queryKey: ['settings', 'email'] })
    },
    onError: (value) => {
      const latestDraft = useAccessDraftStore.getState().emailSettings ?? current
      const conflict = isStaleSettingsError(value)
      setDraft({ ...latestDraft, submitting: false, conflict })
      if (value instanceof Error && value.message === 'default locale required') {
        setLocaleError(true)
        return
      }
      notifyRequestError(value, t, conflict
        ? { title: t('access:conflictTitle'), description: t('access:draftConflictDescription') }
        : { title: t('email.saveFailed'), description: translateProblemWithFields(value, t) })
    },
  })
  const test = useMutation({
    retry: false,
    mutationFn: async (recipient: string) => {
      if (!api.testEmailSettings) throw new Error('missing testEmailSettings')
      if (!current.defaultLocale) throw new Error('default locale required')
      return api.testEmailSettings({ host: current.host, port: current.port, security: current.security, username: current.username, password: current.password || undefined, clearPassword: current.clearPassword, fromAddress: current.fromAddress, fromName: current.fromName, defaultLocale: current.defaultLocale, revision: current.revision, recipient })
    },
    onSuccess: () => {
      setTestDialogOpen(false)
      setTestRecipient('')
      setTestRecipientError(false)
      notifySuccess(t('email.testSuccess'))
    },
    onError: (value) => {
      notifyRequestError(value, t, { title: t('email.testFailed'), description: translateProblemWithFields(value, t) })
    },
  })
  if (query.isPending) return <p role="status">{t('common:loading')}</p>
  const update = (patch: Partial<EmailSettingsDraft>) => { setLocaleError(false); setDraft({ ...current, ...patch, conflict: false }) }
  const busy = save.isPending || test.isPending
  const disabled = busy || !canWrite || current.conflict
  const hasSettings = Boolean(query.data || draft)
  return <section className="flex max-w-3xl flex-col gap-5" aria-labelledby="settings-title">
    <div><h1 id="settings-title" className="text-2xl font-semibold tracking-tight">{t('title')}</h1></div>
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><MailCheck aria-hidden="true" />{t('email.title')}</CardTitle></CardHeader>
      <CardContent>{query.isError && !hasSettings ? <p role="status" className="text-sm text-muted-foreground">{t('common:refreshPage')}</p> : <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); if (!busy && !current.conflict) save.mutate() }} noValidate>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]"><Field><FieldLabel htmlFor="smtp-host">{t('email.host')}</FieldLabel><Input id="smtp-host" value={current.host} onChange={(event) => update({ host: event.target.value })} disabled={disabled} /></Field><Field><FieldLabel htmlFor="smtp-port">{t('email.port')}</FieldLabel><Input id="smtp-port" type="number" min={1} max={65535} value={current.port} onChange={(event) => update({ port: Number(event.target.value) })} disabled={disabled} /></Field></div>
          <Field><FieldLabel htmlFor="smtp-security">{t('email.security')}</FieldLabel><Select value={current.security} onValueChange={(value) => update({ security: value as EmailSettingsDraft['security'] })} disabled={disabled}><SelectTrigger id="smtp-security"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t('email.securityNone')}</SelectItem><SelectItem value="starttls">{t('email.securityStartTLS')}</SelectItem><SelectItem value="tls">{t('email.securityTLS')}</SelectItem></SelectContent></Select></Field>
          <fieldset className="flex flex-col gap-3 rounded-md border p-4"><legend className="px-1 text-sm font-medium">{t('email.authentication')}</legend><label className="flex items-start gap-3 text-sm"><Checkbox id="smtp-authentication" aria-label={t('email.useAuthentication')} checked={current.authentication} onCheckedChange={(value) => update(value === true ? { authentication: true, clearPassword: false } : { authentication: false, username: '', password: '', clearPassword: current.passwordSet })} disabled={disabled} /><span><span className="flex items-center gap-2 font-medium"><KeyRound aria-hidden="true" />{t('email.useAuthentication')}</span><span className="block text-muted-foreground">{t('email.authenticationDescription')}</span></span></label><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="smtp-username">{t('email.username')}</FieldLabel><Input id="smtp-username" value={current.username} onChange={(event) => update({ username: event.target.value })} disabled={disabled || !current.authentication} /></Field><Field><FieldLabel htmlFor="smtp-password">{current.passwordSet ? t('email.passwordReplace') : t('email.password')}</FieldLabel><div className="flex gap-2"><Input id="smtp-password" className="min-w-0" type="password" autoComplete="new-password" value={current.password} onChange={(event) => update({ password: event.target.value, clearPassword: false })} disabled={disabled || !current.authentication} />{current.passwordSet && current.authentication && !current.clearPassword ? <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={t('email.clearPassword')} title={t('email.clearPassword')} onClick={() => update({ password: '', clearPassword: true })} disabled={disabled}><Trash2 aria-hidden="true" /></Button> : null}</div>{current.clearPassword ? <FieldError>{t('email.passwordCleared')}</FieldError> : null}</Field></div></fieldset>
          <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="smtp-from-address">{t('email.fromAddress')}</FieldLabel><Input id="smtp-from-address" type="email" value={current.fromAddress} onChange={(event) => update({ fromAddress: event.target.value })} disabled={disabled} /></Field><Field><FieldLabel htmlFor="smtp-from-name">{t('email.fromName')}</FieldLabel><Input id="smtp-from-name" value={current.fromName} onChange={(event) => update({ fromName: event.target.value })} disabled={disabled} /></Field></div>
          <Field data-invalid={localeError || undefined}><FieldLabel htmlFor="smtp-default-locale">{t('email.defaultLocale')}</FieldLabel><Select value={current.defaultLocale ?? ''} onValueChange={(value) => update({ defaultLocale: value as 'en' | 'zh-CN' })} disabled={disabled}><SelectTrigger id="smtp-default-locale" aria-invalid={localeError}><SelectValue placeholder={t('email.chooseLocale')} /></SelectTrigger><SelectContent><SelectItem value="zh-CN">{t('common:chinese')}</SelectItem><SelectItem value="en">{t('common:english')}</SelectItem></SelectContent></Select>{localeError ? <FieldError>{t('email.chooseLocale')}</FieldError> : null}</Field>
        </FieldGroup>
        <div className="flex flex-wrap justify-end gap-2">{canWrite ? <><Button type="button" variant="outline" disabled={disabled} onClick={() => { if (!current.defaultLocale) { setLocaleError(true); return }; setTestRecipient(''); setTestRecipientError(false); setTestDialogOpen(true) }}><Send aria-hidden="true" data-icon="inline-start" />{t('email.sendTest')}</Button><Button type="submit" disabled={disabled || !current.defaultLocale}><Save aria-hidden="true" data-icon="inline-start" />{save.isPending ? t('common:saving') : t('common:save')}</Button></> : null}</div>
      </form>}</CardContent>
    </Card>
    <Dialog open={testDialogOpen} onOpenChange={(open) => { if (test.isPending) return; setTestDialogOpen(open); if (!open) setTestRecipientError(false) }}>
      <DialogContent closeLabel={t('common:close')} className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t('email.testTitle')}</DialogTitle></DialogHeader>
        <form className="flex flex-col gap-6" noValidate onSubmit={(event) => {
          event.preventDefault()
          const input = event.currentTarget.elements.namedItem('test-recipient')
          if (!(input instanceof HTMLInputElement) || !input.checkValidity()) {
            setTestRecipientError(true)
            return
          }
          test.mutate(input.value.trim())
        }}>
          <Field data-invalid={testRecipientError || undefined}>
            <FieldLabel htmlFor="test-recipient">{t('email.testRecipient')}</FieldLabel>
            <Input id="test-recipient" name="test-recipient" type="email" required autoComplete="email" placeholder={t('email.testRecipientPlaceholder')} value={testRecipient} onChange={(event) => { setTestRecipient(event.target.value); setTestRecipientError(false) }} aria-invalid={testRecipientError} disabled={test.isPending} />
            {testRecipientError ? <FieldError>{t('problems:fields.invalidEmail')}</FieldError> : null}
          </Field>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={test.isPending}>{t('common:cancel')}</Button></DialogClose>
            <Button type="submit" disabled={test.isPending}><Send aria-hidden="true" data-icon="inline-start" />{test.isPending ? t('email.testing') : t('email.sendTest')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>
}

function isStaleSettingsError(error: unknown): boolean {
  return error instanceof ApiProblemError && (error.problem.code === 'stale_revision' || error.problem.type === '/problems/stale-revision')
}

function fromSettings(settings: EmailSettings): EmailSettingsDraft {
  const passwordSet = settings.passwordSet
  return { host: settings.host ?? '', port: settings.port ?? 587, security: settings.security ?? 'starttls', authentication: Boolean(settings.username || passwordSet), username: settings.username ?? '', password: '', clearPassword: false, passwordSet, fromAddress: settings.fromAddress ?? '', fromName: settings.fromName ?? '', defaultLocale: settings.defaultLocale, revision: settings.revision, configured: settings.configured, submitting: false, conflict: false }
}
