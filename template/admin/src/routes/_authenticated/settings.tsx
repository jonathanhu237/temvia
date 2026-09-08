import { createFileRoute, useLoaderData } from '@tanstack/react-router'
import { AccessDenied } from '@/features/access/access-error'
import { EmailSettingsPage } from '@/features/settings/email-settings-page'
import { OperationLogRetentionCard } from '@/features/settings/operation-log-retention-card'
import { clearEmailSettingsPasswordDraft } from '@/features/access/drafts'

export const Route = createFileRoute('/_authenticated/settings')({ onLeave: clearEmailSettingsPasswordDraft, component: SettingsRoute })

function SettingsRoute() {
  const { api } = Route.useRouteContext()
  const { user } = useLoaderData({ from: '/_authenticated' })
  if (!user.superAdmin && !user.permissions?.includes('settings.read')) return <AccessDenied />
  return <div className="flex max-w-3xl flex-col gap-5"><EmailSettingsPage api={api} canWrite={Boolean(user.superAdmin || user.permissions?.includes('settings.write'))} /><OperationLogRetentionCard api={api} userID={user.id} canWrite={Boolean(user.superAdmin || user.permissions?.includes('settings.write'))} /></div>
}
