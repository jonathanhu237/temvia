import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AuthPage } from './auth-page'
import { translateProblem } from '@/shared/api/problems'

export function SessionError({ error, reset }: { error: unknown; reset: () => void }) {
  const { t } = useTranslation(['auth', 'problems'])
  const { t: commonT } = useTranslation('common')
  return (
    <AuthPage
      title={t('sessionUnavailableTitle')}
      description={t('sessionUnavailableDescription')}
    >
      <div className="flex flex-col gap-5">
        <Alert variant="destructive" role="alert"><AlertDescription>{translateProblem(error, t)}</AlertDescription></Alert>
        <Button type="button" onClick={reset} className="w-full">{commonT('retry')}</Button>
      </div>
    </AuthPage>
  )
}
