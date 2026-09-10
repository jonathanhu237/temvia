import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, Send, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SettingsSection } from './settings-section'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiProblemError, type ApiClient } from '@/shared/api/client'
import type { EmailSettings } from '@/shared/api/contracts'
import { isForbidden, translateProblemWithFields, translateRateLimitedProblemWithFields } from '@/shared/api/problems'
import { notifyRequestError, notifySuccess, readFailureFeedback, useRequestErrorToast } from '@/shared/feedback'
import { useAccessDraftStore, type EmailSettingsDraft } from '@/features/access/drafts'

const emptyDraft: EmailSettingsDraft = {
  host: '', port: 587, security: 'starttls', authentication: false, username: '', password: '', clearPassword: false, passwordSet: false, fromAddress: '', fromName: 'Temvia', revision: 0, configured: false, submitting: false, conflict: false,
}

export function EmailSettingsPage({ api, canWrite = true, showTitle = true }: { api: ApiClient; canWrite?: boolean; showTitle?: boolean }) {
  const { t } = useTranslation(['settings', 'common', 'problems', 'access'])
  const queryClient = useQueryClient()
  const draft = useAccessDraftStore((state) => state.emailSettings)
  const setDraft = useAccessDraftStore((state) => state.setEmailSettings)
  const [testDialogOpen, setTestDialogOpen] = useState(false)
  const [testRecipient, setTestRecipient] = useState('')
  const [testRecipientError, setTestRecipientError] = useState(false)
  const [localeError, setLocaleError] = useState(false)
  const query = useQuery({ queryKey: ['settings', 'email'], queryFn: ({ signal }) => api.getEmailSettings ? api.getEmailSettings(signal) : Promise.reject(new Error('missing getEmailSettings')), retry: false })
  useRequestErrorToast(query.error, query.isError, t, readFailureFeedback(query.error, { unavailableTitle: t('email.readUnavailableTitle'), unavailableDescription: t('email.readUnavailableDescription'), forbiddenTitle: t('access:forbiddenTitle'), forbiddenDescription: t('access:forbiddenDescription') }))

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
      notifyRequestError(value, t, { title: t('email.testFailed'), description: translateRateLimitedProblemWithFields(value, t, 'testEmailRateLimited') })
    },
  })
  if (query.isPending) return <p role="status">{t('common:loading')}</p>
  const update = (patch: Partial<EmailSettingsDraft>) => { setLocaleError(false); setDraft({ ...current, ...patch, conflict: false }) }
  const busy = save.isPending || test.isPending
  const disabled = busy || !canWrite || current.conflict
  const hasSettings = Boolean(query.data || draft)
  const forbidden = query.isError && isForbidden(query.error)
  return <section className="flex min-w-0 flex-col gap-8" aria-labelledby="settings-title">
    {showTitle ? <><div><h1 id="settings-title" className="text-2xl font-semibold tracking-tight">{t('title')}</h1></div><Separator /></> : null}
    <SettingsSection id="email-settings-title" title={t('email.title')}>{query.isError && (forbidden || !hasSettings) ? <p role="status" className="text-sm text-muted-foreground">{forbidden ? t('access:forbiddenDescription') : t('common:refreshPage')}</p> : <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); if (!busy && !current.conflict) save.mutate() }} noValidate>
        <FieldGroup>
          <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]"><Field><FieldLabel htmlFor="smtp-host">{t('email.host')}</FieldLabel><Input id="smtp-host" value={current.host} onChange={(event) => update({ host: event.target.value })} disabled={disabled} /></Field><Field><FieldLabel htmlFor="smtp-port">{t('email.port')}</FieldLabel><Input id="smtp-port" type="number" min={1} max={65535} value={current.port} onChange={(event) => update({ port: Number(event.target.value) })} disabled={disabled} /></Field></FieldGroup>
          <Field className="max-w-xs"><FieldLabel htmlFor="smtp-security">{t('email.security')}</FieldLabel><Select value={current.security} onValueChange={(value) => update({ security: value as EmailSettingsDraft['security'] })} disabled={disabled}><SelectTrigger id="smtp-security"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="none">{t('email.securityNone')}</SelectItem><SelectItem value="starttls">{t('email.securityStartTLS')}</SelectItem><SelectItem value="tls">{t('email.securityTLS')}</SelectItem></SelectGroup></SelectContent></Select></Field>
          <Separator />
          <FieldSet className="gap-5">
            <FieldLegend className="sr-only">{t('email.authentication')}</FieldLegend>
            <Field orientation="horizontal" data-disabled={disabled || undefined}>
              <Checkbox id="smtp-authentication" aria-label={t('email.useAuthentication')} aria-describedby="smtp-authentication-description" aria-controls={current.authentication ? 'smtp-credentials' : undefined} checked={current.authentication} onCheckedChange={(value) => update(value === true ? { authentication: true, clearPassword: false } : { authentication: false, username: '', password: '', clearPassword: current.passwordSet })} disabled={disabled} />
              <FieldContent>
                <FieldLabel htmlFor="smtp-authentication" className="min-h-6">{t('email.useAuthentication')}</FieldLabel>
                <FieldDescription id="smtp-authentication-description">{t('email.authenticationDescription')}</FieldDescription>
              </FieldContent>
            </Field>
            {current.authentication ? <FieldGroup id="smtp-credentials" className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="smtp-username">{t('email.username')}</FieldLabel><Input id="smtp-username" value={current.username} onChange={(event) => update({ username: event.target.value })} disabled={disabled || !current.authentication} /></Field><Field><FieldLabel htmlFor="smtp-password">{current.passwordSet ? t('email.passwordReplace') : t('email.password')}</FieldLabel><div className="flex gap-2"><Input id="smtp-password" className="min-w-0" type="password" autoComplete="new-password" value={current.password} onChange={(event) => update({ password: event.target.value, clearPassword: false })} disabled={disabled || !current.authentication} />{current.passwordSet && current.authentication && !current.clearPassword ? <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={t('email.clearPassword')} title={t('email.clearPassword')} onClick={() => update({ password: '', clearPassword: true })} disabled={disabled}><Trash2 aria-hidden="true" /></Button> : null}</div>{current.clearPassword ? <FieldError>{t('email.passwordCleared')}</FieldError> : null}</Field></FieldGroup> : null}
          </FieldSet>
          <Separator />
          <FieldGroup className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="smtp-from-address">{t('email.fromAddress')}</FieldLabel><Input id="smtp-from-address" type="email" value={current.fromAddress} onChange={(event) => update({ fromAddress: event.target.value })} disabled={disabled} /></Field><Field><FieldLabel htmlFor="smtp-from-name">{t('email.fromName')}</FieldLabel><Input id="smtp-from-name" value={current.fromName} onChange={(event) => update({ fromName: event.target.value })} disabled={disabled} /></Field></FieldGroup>
          <Field className="max-w-xs" data-invalid={localeError || undefined}><FieldLabel htmlFor="smtp-default-locale">{t('email.defaultLocale')}</FieldLabel><Select value={current.defaultLocale ?? ''} onValueChange={(value) => update({ defaultLocale: value as 'en' | 'zh-CN' })} disabled={disabled}><SelectTrigger id="smtp-default-locale" aria-invalid={localeError}><SelectValue placeholder={t('email.chooseLocale')} /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="zh-CN">{t('common:chinese')}</SelectItem><SelectItem value="en">{t('common:english')}</SelectItem></SelectGroup></SelectContent></Select>{localeError ? <FieldError>{t('email.chooseLocale')}</FieldError> : null}</Field>
        </FieldGroup>
        <div className="flex flex-wrap justify-end gap-2">{canWrite ? <><Button type="button" variant="outline" disabled={disabled} onClick={() => { if (!current.defaultLocale) { setLocaleError(true); return }; setTestRecipient(''); setTestRecipientError(false); setTestDialogOpen(true) }}><Send aria-hidden="true" data-icon="inline-start" />{t('email.sendTest')}</Button><Button type="submit" disabled={disabled || !current.defaultLocale}><Save aria-hidden="true" data-icon="inline-start" />{save.isPending ? t('common:saving') : t('common:save')}</Button></> : null}</div>
      </form>}
    </SettingsSection>
    <Dialog open={testDialogOpen && !forbidden} onOpenChange={(open) => { if (test.isPending) return; setTestDialogOpen(open); if (!open) setTestRecipientError(false) }}>
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
