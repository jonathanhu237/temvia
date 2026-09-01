import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ApiProblemError, ApiProtocolError, ApiTransportError } from '@/shared/api/client'
import { translateProblem } from '@/shared/api/problems'

export type AccessFailureKind = 'forbidden' | 'conflict' | 'validation' | 'dependency'

const conflictCodes = new Set([
  'role_in_use',
  'role_immutable',
  'last_super_admin',
  'stale_revision',
  'role_already_exists',
  'invitation_pending',
])

export function accessFailureKind(error: unknown): AccessFailureKind {
  if (error instanceof ApiProblemError) {
    if (error.problem.status === 403 || error.problem.code === 'forbidden') return 'forbidden'
    if (error.problem.status === 409 || conflictCodes.has(error.problem.code ?? '')) return 'conflict'
    if (error.problem.status === 422 || error.problem.code === 'validation_failed') return 'validation'
    return 'dependency'
  }
  if (error instanceof ApiTransportError || error instanceof ApiProtocolError) return 'dependency'
  return 'dependency'
}

type AccessErrorProps = {
  error: unknown
  onRetry?: () => void
  onReload?: () => void
}

export function AccessError({ error, onRetry, onReload }: AccessErrorProps) {
  const { t } = useTranslation(['access', 'common', 'problems'])
  const kind = accessFailureKind(error)
  const title = kind === 'dependency' ? t('unavailableTitle') : t(`${kind}Title`)
  const description = kind === 'forbidden'
    ? t('forbiddenDescription')
    : kind === 'dependency'
      ? t('unavailableDescription')
      : translateProblem(error, t)
  const action = kind === 'conflict' ? onReload : kind === 'dependency' ? onRetry : undefined

  return (
    <Alert variant="destructive" role="alert" aria-live="polite">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>{description}</span>
        {action && <Button type="button" variant="outline" size="sm" onClick={action}>{kind === 'conflict' ? t('reload') : t('common:retry')}</Button>}
      </AlertDescription>
    </Alert>
  )
}
