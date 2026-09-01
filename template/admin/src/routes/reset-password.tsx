import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { AuthPage } from '@/features/auth/auth-page'
import { PasswordResetForm } from '@/features/auth/password-reset-form'
import { clearPasswordResetAuthority, getPasswordResetAuthority } from '@/shared/bootstrap/setup-authority'

export const Route = createFileRoute('/reset-password')({
  onLeave: () => clearPasswordResetAuthority(),
  component: ResetPasswordRoute,
})

function ResetPasswordRoute() {
  const { t } = useTranslation(['auth', 'common'])
  const { t: commonT } = useTranslation('common')
  const { api } = Route.useRouteContext()
  const [authority, setAuthority] = useState(() => getPasswordResetAuthority())
  const [success, setSuccess] = useState(false)

  const invalidAuthority = () => {
    clearPasswordResetAuthority()
    setAuthority(undefined)
  }

  if (success) {
    return (
      <AuthPage title={t('resetPasswordSuccessTitle')} description={t('resetPasswordSuccessDescription')}>
        <Button asChild className="w-full"><a href="/login">{commonT('backToLogin')}</a></Button>
      </AuthPage>
    )
  }
  if (!authority) {
    return (
      <AuthPage title={t('invalidResetLinkTitle')} description={t('invalidResetLinkDescription')}>
        <Button asChild className="w-full"><a href="/forgot-password">{t('resetAgain')}</a></Button>
      </AuthPage>
    )
  }

  return (
    <AuthPage title={t('resetPasswordTitle')} description={t('resetPasswordDescription')}>
      <PasswordResetForm api={api} token={authority} onSuccess={() => { clearPasswordResetAuthority(); setSuccess(true) }} onInvalidAuthority={invalidAuthority} />
      <div className="mt-4">
        <Button asChild type="button" variant="link" className="w-full"><a href="/login">{commonT('backToLogin')}</a></Button>
      </div>
    </AuthPage>
  )
}
