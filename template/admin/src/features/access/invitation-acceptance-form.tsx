import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { ApiProblemError, type ApiClient } from '@/shared/api/client'
import { fieldProblemFor, translateFieldProblem, translateProblem } from '@/shared/api/problems'
import { passwordResetFormSchema, normalizePasswordResetValues, type PasswordResetFormValues } from '@/features/auth/schemas'
import { PasswordField } from '@/features/auth/form-fields'

export function InvitationAcceptanceForm({ api, token, onSuccess, onInvalid }: { api: ApiClient; token: string; onSuccess: () => void; onInvalid: () => void }) {
  const { t, i18n } = useTranslation(['access', 'problems', 'auth'])
  const [error, setError] = useStateError()
  const form = useForm<PasswordResetFormValues>({ resolver: zodResolver(passwordResetFormSchema), mode: 'onBlur', shouldFocusError: true, defaultValues: { password: '', passwordConfirmation: '' } })
  const mutation = useMutation({ retry: false, mutationFn: (values: PasswordResetFormValues) => { if (!api.acceptInvitation) throw new Error('missing acceptInvitation'); return api.acceptInvitation({ token, password: normalizePasswordResetValues(values).password, locale: i18n.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en' }) }, onSuccess, onError: (value) => { if (value instanceof ApiProblemError && value.problem.type === '/problems/invalid-invitation') { onInvalid(); return }; setError(translateProblem(value, t)) } })
  const submit = form.handleSubmit(async (values) => { setError(undefined); try { await mutation.mutateAsync(values) } catch (value) { if (value instanceof ApiProblemError) { const field = fieldProblemFor(value, '/password'); const message = translateFieldProblem(field, t); if (message) form.setError('password', { type: 'server', message }) } } })
  return <form noValidate className="flex flex-col gap-6" onSubmit={(event) => void submit(event)}>{error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}<FieldGroup><PasswordField id="password" label={t('auth:passwordLabel')} registration={form.register('password')} error={form.formState.errors.password} autoComplete="new-password" /><PasswordField id="passwordConfirmation" label={t('auth:confirmPasswordLabel')} registration={form.register('passwordConfirmation')} error={form.formState.errors.passwordConfirmation} autoComplete="new-password" /></FieldGroup><Button type="submit" className="w-full" disabled={mutation.isPending}>{mutation.isPending ? t('acceptingInvitation') : t('acceptInvitation')}</Button></form>
}

function useStateError(): [string | undefined, (value: string | undefined) => void] {
  const [value, setValue] = useState<string>()
  return [value, setValue]
}
