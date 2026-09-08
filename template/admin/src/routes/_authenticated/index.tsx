import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useLoaderData } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { isForbidden } from '@/shared/api/problems'
import { readFailureFeedback, useRequestErrorToast } from '@/shared/feedback'

export const Route = createFileRoute('/_authenticated/')({
  component: HomeRoute,
})

function HomeRoute() {
  const { t } = useTranslation(['auth', 'common', 'access', 'operationLog'])
  const { user } = useLoaderData({ from: '/_authenticated' })
  const { api } = Route.useRouteContext()
  const warnings = useQuery({ queryKey: ['operational-warnings', user.id], queryFn: ({ signal }) => api.getOperationalWarnings ? api.getOperationalWarnings(signal) : Promise.resolve({ warnings: [] }), retry: false })
  const operationLogStatus = useQuery({ queryKey: ['operation-log-status', user.id], queryFn: ({ signal }) => api.getOperationLogStatus ? api.getOperationLogStatus(signal) : Promise.resolve({ state: 'unknown' as const, failureCount: 0 }), enabled: Boolean(user.superAdmin || user.permissions?.includes('operation-logs.read')), retry: false, refetchInterval: 30_000, refetchIntervalInBackground: false })
  const canReadOperationLogs = Boolean(user.superAdmin || user.permissions?.includes('operation-logs.read'))
  const warningsForbidden = warnings.isError && isForbidden(warnings.error)
  const operationLogStatusForbidden = operationLogStatus.isError && isForbidden(operationLogStatus.error)
  useRequestErrorToast(warnings.error, warnings.isError, t, readFailureFeedback(warnings.error, { unavailableTitle: t('auth:operationalWarningUnavailableTitle'), unavailableDescription: t('common:refreshPage'), forbiddenTitle: t('access:forbiddenTitle'), forbiddenDescription: t('access:forbiddenDescription') }))
  useRequestErrorToast(operationLogStatus.error, operationLogStatus.isError && !operationLogStatusForbidden, t, readFailureFeedback(operationLogStatus.error, { unavailableTitle: t('operationLog:statusUnavailableTitle'), unavailableDescription: t('common:refreshPage'), forbiddenTitle: t('access:forbiddenTitle'), forbiddenDescription: t('access:forbiddenDescription') }))
  return (
    <section className="flex max-w-3xl flex-col gap-3">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t('homeTitle')}</h1>
      {!warningsForbidden ? warnings.data?.warnings.map((warning) => <Alert key={warning.key} variant="destructive"><AlertTitle>{t('operationalWarningTitle')}</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{warning.key === 'email_not_configured' ? t('emailNotConfiguredWarning') : warning.key}</span>{warning.key === 'email_not_configured' && (user.superAdmin || user.permissions?.includes('settings.write')) ? <Button asChild size="sm" variant="outline"><Link to="/settings">{t('common:configureSettings')}</Link></Button> : null}</AlertDescription></Alert>) : null}
      {canReadOperationLogs && !operationLogStatusForbidden && operationLogStatus.isError ? <Alert><AlertTitle>{t('operationLog:statusUnavailableTitle')}</AlertTitle><AlertDescription>{t('operationLog:statusUnavailableDescription')}</AlertDescription></Alert> : null}
      {canReadOperationLogs && !operationLogStatusForbidden && !operationLogStatus.isError && operationLogStatus.data?.state === 'unknown' ? <Alert><AlertTitle>{t('operationLog:statusUnknownTitle')}</AlertTitle><AlertDescription>{t('operationLog:statusUnknownDescription')}</AlertDescription></Alert> : null}
      {canReadOperationLogs && !operationLogStatusForbidden && !operationLogStatus.isError && operationLogStatus.data?.state === 'failed' ? <Alert variant="destructive"><AlertTitle>{t('operationLog:statusFailedTitle')}</AlertTitle><AlertDescription><Link className="underline" to="/operation-logs">{t('operationLog:statusFailedDescription')}</Link></AlertDescription></Alert> : null}
      {canReadOperationLogs && !operationLogStatusForbidden && !operationLogStatus.isError && operationLogStatus.data?.state === 'recovered' ? <Alert><AlertTitle>{t('operationLog:statusRecoveredTitle')}</AlertTitle><AlertDescription>{t('operationLog:statusRecoveredDescription')}</AlertDescription></Alert> : null}
    </section>
  )
}
