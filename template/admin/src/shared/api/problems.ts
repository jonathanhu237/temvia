import { ApiProblemError, ApiProtocolError, ApiTransportError } from './client'
import type { FieldProblem } from './contracts'

const typeKeys: Record<string, string> = {
  '/problems/invalid-request': 'problems:invalidRequest',
  '/problems/invalid-credentials': 'problems:invalidCredentials',
  '/problems/unauthenticated': 'problems:unauthenticated',
  '/problems/forbidden': 'problems:forbidden',
  '/problems/invalid-setup-token': 'problems:invalidSetupToken',
  '/problems/invalid-password-reset-token': 'problems:invalidPasswordResetToken',
  '/problems/invalid-invitation': 'problems:invalidInvitation',
  '/problems/role-in-use': 'problems:roleInUse',
  '/problems/role-immutable': 'problems:roleImmutable',
  '/problems/last-super-admin': 'problems:lastSuperAdmin',
  '/problems/stale-revision': 'problems:staleRevision',
  '/problems/role-already-exists': 'problems:roleAlreadyExists',
  '/problems/invitation-pending': 'problems:invitationPending',
  '/problems/not-found': 'problems:notFound',
  '/problems/method-not-allowed': 'problems:methodNotAllowed',
  '/problems/setup-complete': 'problems:setupComplete',
  '/problems/content-too-large': 'problems:contentTooLarge',
  '/problems/unsupported-media-type': 'problems:unsupportedMediaType',
  '/problems/validation-failed': 'problems:validationFailed',
  '/problems/rate-limited': 'problems:rateLimited',
  '/problems/internal-error': 'problems:internalError',
  '/problems/service-unavailable': 'problems:serviceUnavailable',
}

const codeKeys: Record<string, string> = {
  invalid_request: 'problems:invalidRequest',
  invalid_credentials: 'problems:invalidCredentials',
  unauthenticated: 'problems:unauthenticated',
  forbidden: 'problems:forbidden',
  invalid_setup_token: 'problems:invalidSetupToken',
  invalid_password_reset_token: 'problems:invalidPasswordResetToken',
  invalid_invitation: 'problems:invalidInvitation',
  role_in_use: 'problems:roleInUse',
  role_immutable: 'problems:roleImmutable',
  last_super_admin: 'problems:lastSuperAdmin',
  stale_revision: 'problems:staleRevision',
  role_already_exists: 'problems:roleAlreadyExists',
  invitation_pending: 'problems:invitationPending',
  setup_complete: 'problems:setupComplete',
  validation_failed: 'problems:validationFailed',
  rate_limited: 'problems:rateLimited',
  service_unavailable: 'problems:serviceUnavailable',
}

const fieldKeys: Record<string, string> = {
  required: 'problems:fields.required',
  invalid_name: 'problems:fields.invalidName',
  invalid_email: 'problems:fields.invalidEmail',
  invalid_password: 'problems:fields.invalidPassword',
  invalid_login_password: 'problems:fields.invalidLoginPassword',
  invalid_value: 'problems:fields.invalidValue',
  email_already_registered: 'problems:fields.emailAlreadyRegistered',
  password_mismatch: 'problems:fields.passwordMismatch',
  empty_permissions: 'problems:fields.emptyPermissions',
  unknown_permission: 'problems:fields.unknownPermission',
  invalid_role: 'problems:fields.invalidRole',
  duplicate_role: 'problems:fields.duplicateRole',
  invalid_revision: 'problems:fields.invalidRevision',
  invalid_limit: 'problems:fields.invalidLimit',
  invalid_cursor: 'problems:fields.invalidCursor',
  invalid_role_set: 'problems:fields.invalidRoleSet',
  invalid_description: 'problems:fields.invalidDescription',
  invalid_locale: 'problems:fields.invalidValue',
}

export function fieldMessageKey(code: string | undefined): string {
  return fieldKeys[code ?? ''] ?? 'problems:fields.invalidValue'
}

export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiProblemError && error.problem.status === 401 && (
    error.problem.type === '/problems/unauthenticated' || error.problem.code === 'unauthenticated'
  )
}

export function isInvalidSetupToken(error: unknown): boolean {
  return error instanceof ApiProblemError && error.problem.status === 403 && (
    error.problem.type === '/problems/invalid-setup-token' || error.problem.code === 'invalid_setup_token'
  )
}

export function isSetupComplete(error: unknown): boolean {
  return error instanceof ApiProblemError && error.problem.status === 409 && (
    error.problem.type === '/problems/setup-complete' || error.problem.code === 'setup_complete'
  )
}

export function isInvalidPasswordResetToken(error: unknown): boolean {
  return error instanceof ApiProblemError && error.problem.status === 403 && (
    error.problem.type === '/problems/invalid-password-reset-token' || error.problem.code === 'invalid_password_reset_token'
  )
}

export function problemMessageKey(error: unknown): string {
  if (error instanceof ApiProblemError) {
    return typeKeys[error.problem.type] ?? codeKeys[error.problem.code ?? ''] ?? 'problems:generic'
  }
  if (error instanceof ApiTransportError) {
    return error.aborted ? 'problems:requestCancelled' : 'problems:network'
  }
  if (error instanceof ApiProtocolError) {
    return 'problems:malformedResponse'
  }
  return 'problems:generic'
}

export function translateProblem(error: unknown, t: unknown): string {
  return (t as (key: string) => string)(problemMessageKey(error))
}

export function translatePasswordResetProblem(error: unknown, t: unknown): string {
  if (error instanceof ApiProblemError && error.problem.status === 429 && (
    error.problem.type === '/problems/rate-limited' || error.problem.code === 'rate_limited'
  )) {
    return (t as (key: string) => string)('problems:passwordResetRateLimited')
  }
  return translateProblem(error, t)
}

export function problemFieldKey(field: FieldProblem): string {
  return fieldMessageKey(field.code)
}

export function fieldProblemFor(error: unknown, pointer: string): FieldProblem | undefined {
  if (!(error instanceof ApiProblemError)) return undefined
  return error.problem.errors?.find((field) => field.pointer === pointer)
}

export function translateFieldProblem(field: FieldProblem | undefined, t: unknown): string | undefined {
  return field ? (t as (key: string) => string)(problemFieldKey(field)) : undefined
}

export function translateClientFieldError(
  error: { type?: string; message?: string } | undefined,
  t: unknown,
): string | undefined {
  if (!error) return undefined
  if (error.type === 'server') return error.message
  return (t as (key: string) => string)(fieldMessageKey(error.message))
}
