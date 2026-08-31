import { createFileRoute, isRedirect, redirect, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { AuthAlert, AuthPage, RecoveryState } from '@/features/auth/auth-page'
import { SetupForm } from '@/features/auth/setup-form'
import { getSetupAuthority, clearSetupAuthority } from '@/shared/bootstrap/setup-authority'
import { translateProblem } from '@/shared/api/problems'
import { setupStatusOptions } from '@/features/auth/queries'

export const Route = createFileRoute('/setup')({
  loader: async ({ context }) => {
    try {
      const status = await context.queryClient.fetchQuery(setupStatusOptions(context.api))
      if (status.status === 'complete') {
        clearSetupAuthority()
        throw redirect({ to: '/login', replace: true })
      }
      return { status, error: undefined }
    } catch (error) {
      if (isRedirect(error)) throw error
      return { status: undefined, error }
    }
  },
  component: SetupRoute,
})

function SetupRoute() {
  const { t } = useTranslation(['auth', 'problems'])
  const { t: commonT } = useTranslation('common')
  const router = useRouter()
  const { api } = Route.useRouteContext()
  const { status, error } = Route.useLoaderData()
  const [authority, setAuthority] = useState(() => getSetupAuthority())
  useEffect(() => () => clearSetupAuthority(), [])

  if (error) {
    return (
      <AuthPage eyebrow={t('setupEyebrow')} title={t('setupDependencyTitle')} description={t('setupDependencyDescription')}>
        <div className="flex flex-col gap-5">
          <AuthAlert title={t('setupDependencyTitle')} description={translateProblem(error, t)} />
          <Button type="button" className="w-full" onClick={() => void router.invalidate()}>{commonT('retry')}</Button>
        </div>
      </AuthPage>
    )
  }
  if (!status) return null

  if (!authority) {
    return (
      <AuthPage eyebrow={t('setupEyebrow')} title={t('setupNoAuthorityTitle')} description={t('setupNoAuthorityDescription')}>
        <RecoveryState title={t('setupNoAuthorityTitle')} description={t('setupNoAuthorityDescription')} instruction={t('setupNoAuthorityInstruction')} />
      </AuthPage>
    )
  }

  return (
    <AuthPage eyebrow={t('setupEyebrow')} title={t('setupTitle')} description={t('setupDescription')}>
      <SetupForm api={api} token={authority} onSuccess={() => void router.navigate({ to: '/login', replace: true })} onInvalidAuthority={() => setAuthority(undefined)} onSetupComplete={() => void router.navigate({ to: '/login', replace: true })} />
    </AuthPage>
  )
}
