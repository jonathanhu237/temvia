import { useQuery } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ApiClient } from '@/shared/api/client'
import type { OperationLog } from '@/shared/api/contracts'
import { isForbidden } from '@/shared/api/problems'
import { readFailureFeedback, useRequestErrorToast } from '@/shared/feedback'

type Translator = (key: any) => string

type Filters = {
  action: string
  objectType: string
  objectId: string
  actorId: string
  from: string
  to: string
  result: '' | 'success' | 'failure'
}

const knownActions = [
  'auth.login', 'auth.logout', 'auth.password_reset.request', 'auth.password_reset.complete', 'auth.invitation.accept', 'auth.setup.complete',
  'roles.create', 'roles.update', 'roles.delete', 'users.roles.update', 'invitations.create', 'invitations.resend', 'invitations.revoke',
  'settings.email.update', 'settings.email.test', 'settings.operation_log_retention.update',
]
const knownObjectTypes = ['session', 'account', 'password_reset', 'password', 'invitation', 'role', 'user', 'email_settings', 'operation_log_settings']
const initialFilters: Filters = { action: '', objectType: '', objectId: '', actorId: '', from: '', to: '', result: '' }

export function OperationLogsPage({ api, userID }: { api: ApiClient; userID: string }) {
  const { t } = useTranslation(['operationLog', 'common', 'access'])
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [cursor, setCursor] = useState<string | undefined>()
  const [history, setHistory] = useState<string[]>([])
  const [selectedID, setSelectedID] = useState<string | undefined>()
  const rangeError = Boolean(filters.from && filters.to && new Date(filters.from).valueOf() >= new Date(filters.to).valueOf())
  const actorError = Boolean(filters.actorId && !isUUID(filters.actorId))
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setCursor(undefined)
    setHistory([])
    setFilters((current) => ({ ...current, [key]: value }))
  }
  const query = useQuery({
    queryKey: ['operation-logs', userID, filters.action, filters.objectType, filters.objectId, filters.actorId, filters.from, filters.to, filters.result, cursor ?? ''],
    queryFn: ({ signal }) => api.getOperationLogs ? api.getOperationLogs({
      action: filters.action || undefined,
      objectType: filters.objectType || undefined,
      objectId: filters.objectId || undefined,
      actorId: filters.actorId || undefined,
      from: filters.from && !rangeError ? toRFC3339(filters.from) : undefined,
      to: filters.to && !rangeError ? toRFC3339(filters.to) : undefined,
      result: filters.result || undefined,
      cursor,
    }, signal) : Promise.reject(new Error('missing getOperationLogs')),
    enabled: !rangeError && !actorError,
    retry: false,
  })
  useRequestErrorToast(query.error, query.isError && !isForbidden(query.error), t, readFailureFeedback(query.error, { unavailableTitle: t('operationLog:readUnavailableTitle'), unavailableDescription: t('operationLog:readUnavailableDescription'), forbiddenTitle: t('access:forbiddenTitle'), forbiddenDescription: t('access:forbiddenDescription') }))
  const detail = useQuery({
    queryKey: ['operation-log', userID, selectedID ?? ''],
    queryFn: ({ signal }) => api.getOperationLog && selectedID ? api.getOperationLog(selectedID, signal) : Promise.reject(new Error('missing getOperationLog')),
    enabled: Boolean(selectedID),
    retry: false,
  })
  const logs = query.data?.logs ?? []
  return <section className="flex max-w-6xl flex-col gap-5" aria-labelledby="operation-log-title">
    <div><h1 id="operation-log-title" className="text-2xl font-semibold tracking-tight">{t('operationLog:title')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('operationLog:description')}</p></div>
    <Card>
      <CardHeader><CardTitle>{t('operationLog:filtersTitle')}</CardTitle></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2"><label htmlFor="operation-log-action" className="text-sm font-medium">{t('operationLog:action')}</label><Input id="operation-log-action" list="operation-log-actions" placeholder={t('operationLog:actionPlaceholder')} value={filters.action} onChange={(event) => setFilter('action', event.target.value)} /><datalist id="operation-log-actions">{knownActions.map((action) => <option key={action} value={action}>{actionLabel(action, t)}</option>)}</datalist></div>
        <div className="flex flex-col gap-2"><label htmlFor="operation-log-object-type" className="text-sm font-medium">{t('operationLog:objectType')}</label><Input id="operation-log-object-type" list="operation-log-object-types" placeholder={t('operationLog:objectTypePlaceholder')} value={filters.objectType} onChange={(event) => setFilter('objectType', event.target.value)} /><datalist id="operation-log-object-types">{knownObjectTypes.map((objectType) => <option key={objectType} value={objectType}>{objectLabel(objectType, t)}</option>)}</datalist></div>
        <div className="flex flex-col gap-2"><label htmlFor="operation-log-actor" className="text-sm font-medium">{t('operationLog:actorFilter')}</label><Input id="operation-log-actor" placeholder={t('operationLog:actorFilterPlaceholder')} value={filters.actorId} onChange={(event) => setFilter('actorId', event.target.value)} aria-invalid={actorError || undefined} />{actorError ? <p className="text-sm text-destructive">{t('operationLog:actorFilterError')}</p> : null}</div>
        <div className="flex flex-col gap-2"><label htmlFor="operation-log-object-id" className="text-sm font-medium">{t('operationLog:objectId')}</label><Input id="operation-log-object-id" placeholder={t('operationLog:objectIdPlaceholder')} value={filters.objectId} onChange={(event) => setFilter('objectId', event.target.value)} /></div>
        <div className="flex flex-col gap-2"><label htmlFor="operation-log-from" className="text-sm font-medium">{t('operationLog:from')}</label><Input id="operation-log-from" type="datetime-local" value={filters.from} onChange={(event) => setFilter('from', event.target.value)} /></div>
        <div className="flex flex-col gap-2"><label htmlFor="operation-log-to" className="text-sm font-medium">{t('operationLog:to')}</label><Input id="operation-log-to" type="datetime-local" value={filters.to} onChange={(event) => setFilter('to', event.target.value)} aria-invalid={rangeError || undefined} />{rangeError ? <p className="text-sm text-destructive">{t('operationLog:timeRangeError')}</p> : null}</div>
        <div className="flex flex-col gap-2"><label htmlFor="operation-log-result" className="text-sm font-medium">{t('operationLog:result')}</label><Select value={filters.result || 'all'} onValueChange={(value) => setFilter('result', value === 'all' ? '' : value as Filters['result'])}><SelectTrigger id="operation-log-result" aria-label={t('operationLog:result')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('operationLog:allResults')}</SelectItem><SelectItem value="success">{t('operationLog:success')}</SelectItem><SelectItem value="failure">{t('operationLog:failure')}</SelectItem></SelectContent></Select></div>
        <div className="flex items-end"><Button type="button" variant="ghost" onClick={() => { setCursor(undefined); setHistory([]); setFilters(initialFilters) }}>{t('common:reset')}</Button></div>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="pt-6">
        {actorError ? <p role="status" className="text-sm text-destructive">{t('operationLog:actorFilterError')}</p> : query.isPending ? <p role="status">{t('common:loading')}</p> : query.isError && isForbidden(query.error) ? <p role="status">{t('access:forbiddenDescription')}</p> : query.isError ? <p role="status">{t('operationLog:readUnavailableDescription')}</p> : logs.length === 0 ? <p className="text-sm text-muted-foreground">{t('operationLog:empty')}</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('operationLog:occurredAt')}</TableHead><TableHead>{t('operationLog:actor')}</TableHead><TableHead>{t('operationLog:action')}</TableHead><TableHead>{t('operationLog:object')}</TableHead><TableHead>{t('operationLog:result')}</TableHead><TableHead className="text-right">{t('access:actions')}</TableHead></TableRow></TableHeader><TableBody>{logs.map((log) => <TableRow key={log.id}><TableCell className="whitespace-nowrap">{formatDate(log.occurredAt)}</TableCell><TableCell>{actorLabel(log, t)}</TableCell><TableCell>{actionLabel(log.action, t)}</TableCell><TableCell>{objectLabel(log.objectType, t)}{log.objectId ? ` · ${log.objectId}` : ''}</TableCell><TableCell><span className={log.result === 'failure' ? 'text-destructive' : 'text-foreground'}>{log.result === 'failure' ? t('operationLog:failure') : t('operationLog:success')}</span></TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" aria-label={t('operationLog:viewDetails')} onClick={() => setSelectedID(log.id)}><Eye aria-hidden="true" /></Button></TableCell></TableRow>)}</TableBody></Table></div>}
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" disabled={history.length === 0 || query.isFetching} onClick={() => { const previous = history[history.length - 1]; setHistory((current) => current.slice(0, -1)); setCursor(previous || undefined) }}>{t('access:previousPage')}</Button><Button variant="outline" disabled={!query.data?.nextCursor || query.isFetching} onClick={() => { if (!query.data?.nextCursor) return; setHistory((current) => [...current, cursor ?? '']); setCursor(query.data.nextCursor) }}>{t('access:nextPage')}</Button></div>
      </CardContent>
    </Card>
    <Dialog open={Boolean(selectedID)} onOpenChange={(open) => { if (!open) setSelectedID(undefined) }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t('operationLog:detailTitle')}</DialogTitle></DialogHeader>{detail.isPending ? <p role="status">{t('common:loading')}</p> : detail.isError ? <p role="status">{t('operationLog:detailUnavailable')}</p> : detail.data ? <OperationLogDetail log={detail.data} t={(key) => t(key as never)} /> : null}<DialogFooter><DialogClose asChild><Button variant="outline">{t('common:close')}</Button></DialogClose></DialogFooter></DialogContent>
    </Dialog>
  </section>
}

function OperationLogDetail({ log, t }: { log: OperationLog; t: Translator }) {
  return <div className="flex flex-col gap-4 text-sm"><dl className="grid gap-2 sm:grid-cols-2"><DetailField label={t('operationLog:action')} value={actionLabel(log.action, t)} /><DetailField label={t('operationLog:objectType')} value={objectLabel(log.objectType, t)} /><DetailField label={t('operationLog:objectId')} value={log.objectId || t('operationLog:notAvailable')} /><DetailField label={t('operationLog:result')} value={log.result === 'failure' ? t('operationLog:failure') : t('operationLog:success')} /><DetailField label={t('operationLog:occurredAt')} value={formatDate(log.occurredAt)} /><DetailField label={t('operationLog:actor')} value={actorLabel(log, t)} /><DetailField label={t('operationLog:sourceIp')} value={log.sourceIp || t('operationLog:notAvailable')} /><DetailField label={t('operationLog:attemptedAccount')} value={log.attemptedAccount || t('operationLog:notAvailable')} /></dl><div><p className="font-medium">{t('operationLog:details')}</p><dl className="mt-2 flex flex-col gap-2 rounded-md bg-muted p-3">{Object.entries(log.details).map(([key, value]) => <div key={key}><dt className="font-medium">{detailLabel(key, t)}</dt><dd className="mt-1 whitespace-pre-wrap text-xs">{formatDetailValue(key, value, t)}</dd></div>)}</dl></div></div>
}

function DetailField({ label, value }: { label: string; value: string }) { return <div><dt className="font-medium">{label}</dt><dd>{value}</dd></div> }

function actorLabel(log: OperationLog, t: Translator): string {
  if (log.actor.kind === 'unverified') return t('operationLog:unverifiedActor')
  if (log.actor.name || log.actor.email) return [log.actor.name, log.actor.email].filter(Boolean).join(' · ')
  if (log.actor.kind === 'system') return t('operationLog:systemActor')
  return log.actor.label || t('operationLog:unknownActor')
}

function actionLabel(action: string, t: Translator): string {
  const key = `operationLog:actionLabels.${action.replaceAll('.', '_')}`
  const value = t(key)
  return value === key ? action : value
}

function objectLabel(objectType: string, t: Translator): string {
  const key = `operationLog:objectLabels.${objectType}`
  const value = t(key)
  return value === key ? objectType : value
}

function detailLabel(key: string, t: Translator): string {
  const normalized = key.replaceAll('.', '_')
  const labelKey = `operationLog:detailLabels.${normalized}`
  const value = t(labelKey)
  return value === labelKey ? key : value
}

function formatDetailValue(key: string, value: unknown, t: Translator): string {
  if (typeof value === 'boolean') return value ? t('operationLog:yes') : t('operationLog:no')
  if (key === 'before' || key === 'after' || key === 'target') return formatSnapshot(value, t)
  if (Array.isArray(value)) return value.map((item) => formatDetailValue(key, item, t)).join(', ')
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => `${detailLabel(childKey, t)}: ${formatDetailValue(childKey, childValue, t)}`).join('; ')
  return String(value ?? t('operationLog:notAvailable'))
}

function formatSnapshot(value: unknown, t: Translator): string {
  if (!value || typeof value !== 'object') return value === null ? t('operationLog:notAvailable') : String(value)
  return Object.entries(value as Record<string, unknown>).map(([key, child]) => `${detailLabel(key, t)}: ${formatDetailValue(key, child, t)}`).join('; ')
}

function toRFC3339(value: string): string { return new Date(value).toISOString() }
// Keep this in lockstep with domain.IsCanonicalUUID: UUIDv7 is valid here and
// the backend deliberately accepts canonical UUIDs without constraining the
// version or variant nibbles.
function isUUID(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) }
function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleString() }
