import { ApiProblemError, ApiProtocolError, ApiTransportError } from './client'
import type { FieldProblem } from './contracts'

const typeKeys: Record<string, string> = {
  '/problems/invalid-request': 'problems:invalidRequest',
  '/problems/invalid-credentials': 'problems:invalidCredentials',
  '/problems/unauthenticated': 'problems:unauthenticated',
  '/problems/forbidden': 'problems:forbidden',
  '/problems/invalid-setup-token': 'problems:invalidSetupToken',
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
  invalid_value: 'problems:fields.invalidValue',
  email_already_registered: 'problems:fields.emailAlreadyRegistered',
  password_mismatch: 'problems:fields.passwordMismatch',
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

export function problemFieldKey(field: FieldProblem): string {
  return fieldKeys[field.code] ?? 'problems:fields.invalidValue'
}

export function fieldProblemFor(error: unknown, pointer: string): FieldProblem | undefined {
  if (!(error instanceof ApiProblemError)) return undefined
  return error.problem.errors?.find((field) => field.pointer === pointer)
}

export function translateFieldProblem(field: FieldProblem | undefined, t: unknown): string | undefined {
  return field ? (t as (key: string) => string)(problemFieldKey(field)) : undefined
}
