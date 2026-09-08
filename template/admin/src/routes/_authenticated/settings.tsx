import { Separator } from '@/components/ui/separator'
import { createFileRoute, useLoaderData } from '@tanstack/react-router'
import { AccessDenied } from '@/features/access/access-error'
import { EmailSettingsPage } from '@/features/settings/email-settings-page'
import { OperationLogRetentionCard } from '@/features/settings/operation-log-retention-card'
import { SettingsNavigation } from '@/features/settings/settings-navigation'
import { clearEmailSettingsPasswordDraft } from '@/features/access/drafts'

export const Route = createFileRoute('/_authenticated/settings')({ onLeave: clearEmailSettingsPasswordDraft, component: SettingsRoute })

function SettingsRoute() {
  const { api } = Route.useRouteContext()
  const { user } = useLoaderData({ from: '/_authenticated' })
  if (!user.superAdmin && !user.permissions?.includes('settings.read')) return <AccessDenied />
  return <div className="grid w-full max-w-[80rem] gap-8 xl:grid-cols-[minmax(0,1fr)_9rem]">
    <div className="flex min-w-0 max-w-[68rem] flex-col gap-8"><EmailSettingsPage api={api} canWrite={Boolean(user.superAdmin || user.permissions?.includes('settings.write'))} /><Separator /><OperationLogRetentionCard api={api} userID={user.id} canWrite={Boolean(user.superAdmin || user.permissions?.includes('settings.write'))} /></div>
    <SettingsNavigation />
  </div>
}
