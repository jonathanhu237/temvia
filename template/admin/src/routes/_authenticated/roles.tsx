import { createFileRoute, useLoaderData } from '@tanstack/react-router'
import { RolesPage } from '@/features/access/roles-page'

export const Route = createFileRoute('/_authenticated/roles')({ component: RolesRoute })

function RolesRoute() {
  const { api } = Route.useRouteContext()
  const { user } = useLoaderData({ from: '/_authenticated' })
  return <RolesPage api={api} canManage={Boolean(user.superAdmin)} />
}
