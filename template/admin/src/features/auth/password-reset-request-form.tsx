import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { ApiProblemError, type ApiClient } from '@/shared/api/client'
import { fieldProblemFor, translateFieldProblem, translatePasswordResetProblem } from '@/shared/api/problems'
import { type Locale } from '@/shared/i18n/resources'
import { normalizePasswordResetRequestValues, passwordResetRequestFormSchema, type PasswordResetRequestFormValues } from './schemas'
import { TextField } from './form-fields'

export function PasswordResetRequestForm({ api, onAccepted }: { api: ApiClient; onAccepted: () => void }) {
  const { t, i18n } = useTranslation(['auth', 'problems'])
  const [formError, setFormError] = useState<string>()
  const form = useForm<PasswordResetRequestFormValues>({
    resolver: zodResolver(passwordResetRequestFormSchema),
    mode: 'onBlur',
    shouldFocusError: true,
    defaultValues: { email: '' },
  })
  const mutation = useMutation({
    retry: false,
    mutationFn: (values: PasswordResetRequestFormValues) => api.requestPasswordReset({
      ...normalizePasswordResetRequestValues(values),
      locale: currentLocale(i18n.language),
    }),
    onSuccess: onAccepted,
  })

  const submit = form.handleSubmit(async (values) => {
    setFormError(undefined)
    try {
      await mutation.mutateAsync(values)
    } catch (error) {
      if (error instanceof ApiProblemError) {
        const field = translateFieldProblem(fieldProblemFor(error, '/email'), t)
        if (field) form.setError('email', { type: 'server', message: field }, { shouldFocus: true })
      }
      setFormError(translatePasswordResetProblem(error, t))
    }
  })

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      {formError && <Alert variant="destructive" role="alert" aria-live="polite"><AlertDescription>{formError}</AlertDescription></Alert>}
      <FieldGroup className="gap-5">
        <TextField id="email" label={t('emailLabel')} registration={form.register('email')} error={form.formState.errors.email} type="email" inputMode="email" autoComplete="email" />
      </FieldGroup>
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? t('sendingResetLink') : t('sendResetLink')}
      </Button>
    </form>
  )
}

function currentLocale(language: string): Locale {
  return language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}
