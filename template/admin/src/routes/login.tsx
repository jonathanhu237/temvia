import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { AuthAlert, AuthPage, RecoveryState } from '@/features/auth/auth-page'
import { LoginForm } from '@/features/auth/login-form'
import { currentUserOptions, setupStatusOptions } from '@/features/auth/queries'
import { translateProblem } from '@/shared/api/problems'

export const Route = createFileRoute('/login')({
  loader: async ({ context }) => {
    try {
      const status = await context.queryClient.fetchQuery(setupStatusOptions(context.api))
      return { status, error: undefined }
    } catch (error) {
      return { status: undefined, error }
    }
  },
  component: LoginRoute,
})

function LoginRoute() {
  const { t } = useTranslation(['auth', 'problems'])
  const { t: commonT } = useTranslation('common')
  const navigate = useNavigate()
  const router = useRouter()
  const { status, error } = Route.useLoaderData()
  const { api } = Route.useRouteContext()
  const currentUser = useQuery({ ...currentUserOptions(api), enabled: status?.status === 'complete' })

  useEffect(() => {
    if (currentUser.data) void navigate({ to: '/', replace: true })
  }, [currentUser.data, navigate])

  if (error) {
    return (
      <AuthPage title={t('setupDependencyTitle')} description={t('setupDependencyDescription')}>
        <div className="flex flex-col gap-5">
          <AuthAlert title={t('setupDependencyTitle')} description={translateProblem(error, t)} />
          <Button type="button" className="w-full" onClick={() => void router.invalidate()}>{commonT('retry')}</Button>
        </div>
      </AuthPage>
    )
  }
  if (!status) return null
  if (status.status === 'required') {
    return (
      <AuthPage title={t('loginRequiredTitle')}>
        <RecoveryState title={t('loginRequiredTitle')} description={t('loginRequiredDescription')} instruction={t('setupNoAuthorityInstruction')} />
      </AuthPage>
    )
  }
  return (
    <AuthPage title={t('loginTitle')}>
      <LoginForm api={api} onSuccess={() => void navigate({ to: '/', replace: true })} />
    </AuthPage>
  )
}
