import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useLoaderData } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useRequestErrorToast } from '@/shared/feedback'

export const Route = createFileRoute('/_authenticated/')({
  component: HomeRoute,
})

function HomeRoute() {
  const { t } = useTranslation(['auth', 'common'])
  const { user } = useLoaderData({ from: '/_authenticated' })
  const { api } = Route.useRouteContext()
  const warnings = useQuery({ queryKey: ['operational-warnings'], queryFn: ({ signal }) => api.getOperationalWarnings ? api.getOperationalWarnings(signal) : Promise.resolve({ warnings: [] }), retry: false })
  useRequestErrorToast(warnings.error, warnings.isError, t, { title: t('auth:operationalWarningUnavailableTitle'), description: t('common:refreshPage') })
  return (
    <section className="flex max-w-3xl flex-col gap-3">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t('homeTitle')}</h1>
      {warnings.data?.warnings.map((warning) => <Alert key={warning.key} variant="destructive"><AlertTitle>{t('operationalWarningTitle')}</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{warning.key === 'email_not_configured' ? t('emailNotConfiguredWarning') : warning.key}</span>{warning.key === 'email_not_configured' && (user.superAdmin || user.permissions?.includes('settings.write')) ? <Button asChild size="sm" variant="outline"><Link to="/settings">{t('common:configureSettings')}</Link></Button> : null}</AlertDescription></Alert>)}
    </section>
  )
}
