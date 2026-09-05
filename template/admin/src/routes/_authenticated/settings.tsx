import { createFileRoute, useLoaderData } from '@tanstack/react-router'
import { AccessDenied } from '@/features/access/access-error'
import { EmailSettingsPage } from '@/features/settings/email-settings-page'
import { clearEmailSettingsPasswordDraft } from '@/features/access/drafts'

export const Route = createFileRoute('/_authenticated/settings')({ onLeave: clearEmailSettingsPasswordDraft, component: SettingsRoute })

function SettingsRoute() {
  const { api } = Route.useRouteContext()
  const { user } = useLoaderData({ from: '/_authenticated' })
  if (!user.superAdmin && !user.permissions?.includes('settings.read')) return <AccessDenied />
  return <EmailSettingsPage api={api} defaultRecipient={user.email} canWrite={Boolean(user.superAdmin || user.permissions?.includes('settings.write'))} />
}
