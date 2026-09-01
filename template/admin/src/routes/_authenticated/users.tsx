import { createFileRoute, useLoaderData } from '@tanstack/react-router'
import { UsersPage } from '@/features/access/users-page'

export const Route = createFileRoute('/_authenticated/users')({ component: UsersRoute })

function UsersRoute() {
  const { user } = useLoaderData({ from: '/_authenticated' })
  const { api } = Route.useRouteContext()
  return <UsersPage api={api} canManage={Boolean(user.superAdmin)} />
}
