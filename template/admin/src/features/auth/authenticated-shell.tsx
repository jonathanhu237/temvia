import { useMutation, useQueryClient } from '@tanstack/react-query'
import { House, LogOut } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
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
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { changeLocale } from '@/shared/i18n'
import type { Locale } from '@/shared/i18n/resources'
import { translateProblem } from '@/shared/api/problems'
import type { ApiClient } from '@/shared/api/client'
import { currentUserQueryKey } from './queries'
import type { User } from '@/shared/api/contracts'

export function AuthenticatedShell({ api, user, children }: { api: ApiClient; user: User; children: React.ReactNode }) {
  const { t, i18n } = useTranslation(['common', 'auth', 'problems'])
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const [logoutError, setLogoutError] = useState<string>()
  const locale: Locale = i18n.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      setLogoutError(undefined)
      queryClient.removeQueries({ queryKey: currentUserQueryKey })
      void navigate({ to: '/login', replace: true })
    },
    onError: (error) => {
      setLogoutError(translateProblem(error, t))
    },
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
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <DropdownMenu>
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
              <DropdownMenuLabel>{t('language')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={locale} onValueChange={(value) => void changeLocale(value as Locale)}>
                <DropdownMenuRadioItem value="zh-CN">{t('chinese')}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="en">{t('english')}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={logout.isPending} onSelect={(event) => { event.preventDefault(); setLogoutError(undefined); logout.mutate() }}>
                <LogOut aria-hidden="true" data-icon="inline-start" />
                {logout.isPending ? t('auth:loggingOut') : t('logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger aria-label={t('menu')} />
          <div className="h-4 w-px bg-border" aria-hidden="true" />
          <p className="text-sm font-medium text-muted-foreground">{t('home')}</p>
        </header>
        <div className="flex min-h-[calc(100dvh-3.5rem)] flex-1 flex-col gap-5 p-4 sm:p-6 lg:p-8">
          {logoutError && (
            <Alert variant="destructive" role="alert" aria-live="polite" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <AlertTitle>{t('auth:logoutFailedTitle')}</AlertTitle>
                <AlertDescription>{logoutError}</AlertDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => { setLogoutError(undefined); logout.mutate() }}>
                {t('retry')}
              </Button>
            </Alert>
          )}
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
