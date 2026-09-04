import { ChevronLeft, ChevronRight, Info, LockKeyhole } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Role } from '@/shared/api/contracts'

export type AccessUser = {
  id: string
  name: string
  email: string
  createdAt: string
  authVersion: number
  roles: Role[]
}

export function formatDate(value: string, language: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date)
}

export function PageNavigation({
  hasPrevious,
  hasNext,
  loading,
  onPrevious,
  onNext,
  t,
}: {
  hasPrevious: boolean
  hasNext: boolean
  loading: boolean
  onPrevious: () => void
  onNext: () => void
  t: (key: string) => string
}) {
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t('pagination')}>
      <Button type="button" variant="outline" size="sm" disabled={!hasPrevious || loading} onClick={onPrevious}>
        <ChevronLeft aria-hidden="true" data-icon="inline-start" />
        {t('previousPage')}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={!hasNext || loading} onClick={onNext}>
        {t('nextPage')}
        <ChevronRight aria-hidden="true" data-icon="inline-end" />
      </Button>
    </nav>
  )
}

export function RoleBadges({ roles, emptyLabel = '—' }: { roles: Role[]; emptyLabel?: string }) {
  const { t } = useTranslation('access')
  if (roles.length === 0) return <span className="text-muted-foreground">{emptyLabel}</span>
  const visibleRoles = roles.slice(0, 2)
  const hiddenRoles = roles.slice(2)
  const allNames = roles.map((role) => role.name).join(', ')
  return (
    <div className="flex max-w-72 flex-wrap items-center gap-1" aria-label={allNames}>
      {visibleRoles.map((role) => <Badge key={role.id} variant="secondary">{role.name}</Badge>)}
      {hiddenRoles.length > 0 ? (
        <TooltipProvider><Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" tabIndex={0} aria-label={t('moreRoles', { count: hiddenRoles.length })}>
              +{hiddenRoles.length}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{hiddenRoles.map((role) => role.name).join(', ')}</TooltipContent>
        </Tooltip></TooltipProvider>
      ) : null}
    </div>
  )
}

export function BuiltInRoleIndicator({ label }: { label: string }) {
  return (
    <TooltipProvider><Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} role="img" aria-label={label} title={label} className="inline-flex shrink-0 rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <LockKeyhole aria-hidden="true" data-icon="inline-start" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip></TooltipProvider>
  )
}

export function AssignmentCount({ count }: { count: number }) {
  const { t } = useTranslation('access')
  return (
    <span className="inline-flex items-center gap-1">
      {count}
      <TooltipProvider><Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} role="img" aria-label={t('assignmentCountDescription')} title={t('assignmentCountDescription')} className="inline-flex rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Info aria-hidden="true" data-icon="inline-start" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('assignmentCountDescription')}</TooltipContent>
      </Tooltip></TooltipProvider>
    </span>
  )
}

export function canAssignRole(role: Role, actorPermissions: string[] | undefined, actorSuperAdmin: boolean): boolean {
  if (actorSuperAdmin) return true
  if (role.system) return false
  const effective = new Set(actorPermissions ?? [])
  return role.permissions.every((permission) => effective.has(permission))
}
