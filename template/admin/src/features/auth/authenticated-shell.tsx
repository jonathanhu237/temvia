import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, House, LogOut, Mail, Settings, ShieldCheck, UserRound, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { PreferencesButtons } from './preferences-menu'
import { translateProblemWithFields } from '@/shared/api/problems'
import { notifyRequestError, notifySuccess } from '@/shared/feedback'
import type { ApiClient } from '@/shared/api/client'
import { currentUserQueryKey } from './queries'
import type { User } from '@/shared/api/contracts'
import { clearAccessDrafts, useAccessDraftStore } from '@/features/access/drafts'

export function AuthenticatedShell({ api, user, children }: { api: ApiClient; user: User; children: React.ReactNode }) {
  const { t } = useTranslation(['common', 'auth', 'problems', 'access'])
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const hasUsersAccess = Boolean(user.superAdmin || user.permissions?.includes('users.read'))
  const hasInvitationsAccess = Boolean(user.superAdmin || user.permissions?.includes('invitations.read'))
  const hasRolesAccess = Boolean(user.superAdmin || user.permissions?.includes('roles.read'))
  const hasSettingsAccess = Boolean(user.superAdmin || user.permissions?.includes('settings.read'))
  const hasAccessMenu = hasUsersAccess || hasInvitationsAccess || hasRolesAccess
  const accessMenuActive = location.pathname.startsWith('/users') || location.pathname.startsWith('/invitations') || location.pathname.startsWith('/roles')
  const [accessMenuOpen, setAccessMenuOpen] = useState(true)
  const accessMenuExpanded = accessMenuOpen || accessMenuActive
  useEffect(() => {
    const previousOwnerID = useAccessDraftStore.getState().ownerID
    if (previousOwnerID !== user.id) queryClient.removeQueries({ queryKey: ['access'] })
    useAccessDraftStore.getState().setOwner(user.id)
  }, [queryClient, user.id])
  const logout = useMutation({
    retry: false,
    meta: { preserveAccessDraftsOnError: true },
    mutationFn: () => api.logout(),
    onSuccess: () => {
      clearAccessDrafts()
      queryClient.removeQueries({ queryKey: currentUserQueryKey })
      queryClient.removeQueries({ queryKey: ['access'] })
      notifySuccess(t('auth:logoutSuccess'))
      void navigate({ to: '/login', replace: true })
    },
    onError: (error) => notifyRequestError(error, t, { title: t('auth:logoutFailedTitle'), description: translateProblemWithFields(error, t) }),
  })

  return (
    <SidebarProvider defaultOpen>
      <Sidebar variant="inset" collapsible="icon" role="navigation" aria-label={t('menu')}>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{t('menu')}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === '/'} tooltip={t('home')}>
                    <Link to="/" aria-current={location.pathname === '/' ? 'page' : undefined}>
                      <House aria-hidden="true" data-icon="inline-start" />
                      <span>{t('home')}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {hasAccessMenu ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton type="button" isActive={accessMenuActive} tooltip={t('access:usersAccess')} aria-expanded={accessMenuExpanded} onClick={() => setAccessMenuOpen((open) => !open)}>
                      <Users aria-hidden="true" data-icon="inline-start" />
                      <span>{t('access:usersAccess')}</span>
                      <ChevronDown aria-hidden="true" className="ml-auto transition-transform data-[open=false]:-rotate-90 group-data-[collapsible=icon]:hidden" data-open={accessMenuExpanded} />
                    </SidebarMenuButton>
                    {accessMenuExpanded ? <SidebarMenuSub>
                      {hasUsersAccess ? <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={location.pathname.startsWith('/users')}><Link to="/users" aria-current={location.pathname.startsWith('/users') ? 'page' : undefined}><UserRound aria-hidden="true" /><span>{t('access:users')}</span></Link></SidebarMenuSubButton></SidebarMenuSubItem> : null}
                      {hasInvitationsAccess ? <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={location.pathname.startsWith('/invitations')}><Link to="/invitations" aria-current={location.pathname.startsWith('/invitations') ? 'page' : undefined}><Mail aria-hidden="true" /><span>{t('access:invitations')}</span></Link></SidebarMenuSubButton></SidebarMenuSubItem> : null}
                      {hasRolesAccess ? <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={location.pathname.startsWith('/roles')}><Link to="/roles" aria-current={location.pathname.startsWith('/roles') ? 'page' : undefined}><ShieldCheck aria-hidden="true" /><span>{t('access:roles')}</span></Link></SidebarMenuSubButton></SidebarMenuSubItem> : null}
                    </SidebarMenuSub> : null}
                  </SidebarMenuItem>
                ) : null}
                {hasSettingsAccess ? <SidebarMenuItem><SidebarMenuButton asChild isActive={location.pathname.startsWith('/settings')} tooltip={t('settings')}><Link to="/settings" aria-current={location.pathname.startsWith('/settings') ? 'page' : undefined}><Settings aria-hidden="true" data-icon="inline-start" /><span>{t('settings')}</span></Link></SidebarMenuButton></SidebarMenuItem> : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent" aria-label={`${user.name}, ${t('menu')}`}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left group-data-[collapsible=icon]:hidden">
                  <span className="w-full truncate text-sm font-medium">{user.name}</span>
                  <span className="w-full truncate text-xs text-muted-foreground">{user.email}</span>
                </span>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-64">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={logout.isPending} onSelect={(event) => { event.preventDefault(); logout.mutate() }}>
                <LogOut aria-hidden="true" data-icon="inline-start" />
                {logout.isPending ? t('auth:loggingOut') : t('logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <SidebarTrigger aria-label={t('menu')} />
            <div className="h-4 w-px bg-border" aria-hidden="true" />
            <p className="truncate text-sm font-medium text-muted-foreground">{location.pathname.startsWith('/users') ? t('access:users') : location.pathname.startsWith('/invitations') ? t('access:invitations') : location.pathname.startsWith('/roles') ? t('access:roles') : location.pathname.startsWith('/settings') ? t('settings') : t('home')}</p>
          </div>
          <PreferencesButtons className="shrink-0" />
        </header>
        <div className="flex min-h-[calc(100dvh-3.5rem)] flex-1 flex-col gap-5 p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
