import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { ApiProblemError, type ApiClient } from '@/shared/api/client'
import { fieldProblemFor, isInvalidSetupToken, isSetupComplete, translateFieldProblem, translateProblem } from '@/shared/api/problems'
import { clearSetupAuthority } from '@/shared/bootstrap/setup-authority'
import { setupFormSchema, normalizeSetupValues, type SetupFormValues } from './schemas'
import { PasswordField, TextField } from './form-fields'

export function SetupForm({ api, token, onSuccess, onInvalidAuthority, onSetupComplete }: { api: ApiClient; token: string; onSuccess: () => void; onInvalidAuthority?: () => void; onSetupComplete?: () => void }) {
  const { t } = useTranslation(['auth', 'problems'])
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string>()
  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupFormSchema),
    mode: 'onBlur',
    shouldFocusError: true,
    defaultValues: { name: '', email: '', password: '', passwordConfirmation: '' },
  })
  const mutation = useMutation({
    mutationFn: (values: SetupFormValues) => api.setup({ token, ...normalizeSetupValues(values) }),
    onSuccess: () => {
      clearSetupAuthority()
      void queryClient.invalidateQueries({ queryKey: ['setup', 'status'] })
      onSuccess()
    },
  })

  const submit = form.handleSubmit(async (values) => {
    setFormError(undefined)
    try {
      await mutation.mutateAsync(values)
    } catch (error) {
      let focused = false
      if (error instanceof ApiProblemError) {
        if (isInvalidSetupToken(error)) {
          clearSetupAuthority()
          onInvalidAuthority?.()
        }
        if (isSetupComplete(error)) {
          clearSetupAuthority()
          onSetupComplete?.()
          return
        }
        for (const fieldName of ['name', 'email', 'password', 'passwordConfirmation'] as const) {
          const field = fieldProblemFor(error, `/${fieldName}`)
          const message = translateFieldProblem(field, t)
          if (message) {
            form.setError(fieldName, { type: 'server', message }, { shouldFocus: !focused })
            focused = true
          }
        }
      }
      setFormError(translateProblem(error, t))
    }
  })

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      {formError && <Alert variant="destructive" role="alert" aria-live="polite"><AlertDescription>{formError}</AlertDescription></Alert>}
      <FieldGroup className="gap-5">
        <TextField id="name" label={t('nameLabel')} registration={form.register('name')} error={form.formState.errors.name} autoComplete="name" />
        <TextField id="email" label={t('emailLabel')} registration={form.register('email')} error={form.formState.errors.email} type="email" inputMode="email" autoComplete="email" />
        <PasswordField id="password" label={t('passwordLabel')} registration={form.register('password')} error={form.formState.errors.password} autoComplete="new-password" />
        <PasswordField id="passwordConfirmation" label={t('confirmPasswordLabel')} registration={form.register('passwordConfirmation')} error={form.formState.errors.passwordConfirmation} autoComplete="new-password" />
      </FieldGroup>
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? t('initializing') : t('initialize')}
      </Button>
    </form>
  )
}
