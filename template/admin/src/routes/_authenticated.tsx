import { createFileRoute, isRedirect, Outlet, redirect } from '@tanstack/react-router'
import { AuthenticatedShell } from '@/features/auth/authenticated-shell'
import { SessionError } from '@/features/auth/session-error'
import { currentUserOptions } from '@/features/auth/queries'
import { isUnauthenticated } from '@/shared/api/problems'

export const Route = createFileRoute('/_authenticated')({
  loader: async ({ context }) => {
    try {
      const user = await context.queryClient.fetchQuery(currentUserOptions(context.api))
      return { user }
    } catch (error) {
      if (isUnauthenticated(error)) {
        context.queryClient.removeQueries({ queryKey: ['auth', 'current-user'] })
        throw redirect({ to: '/login', replace: true })
      }
      if (isRedirect(error)) throw error
      throw error
    }
  },
  errorComponent: ({ error, reset }) => <SessionError error={error} reset={reset} />,
  component: AuthenticatedRoute,
})

function AuthenticatedRoute() {
  const { user } = Route.useLoaderData()
  const { api } = Route.useRouteContext()
  return <AuthenticatedShell api={api} user={user}><Outlet /></AuthenticatedShell>
}

