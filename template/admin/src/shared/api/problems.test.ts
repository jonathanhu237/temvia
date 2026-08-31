import { describe, expect, it } from 'vitest'
import { ApiProblemError } from './client'
import {
  fieldProblemFor,
  isInvalidSetupToken,
  isSetupComplete,
  isUnauthenticated,
  problemMessageKey,
  translateFieldProblem,
  translateProblem,
} from './problems'
import { i18n, initializeI18n } from '@/shared/i18n'

describe('localized problem mapping', () => {
  it('maps stable problem and field codes without exposing server text', async () => {
    await initializeI18n()
    const error = new ApiProblemError({
      type: '/problems/validation-failed',
      title: 'diagnostic title',
      detail: 'internal detail',
      status: 400,
      errors: [{ pointer: '/email', code: 'invalid_email' }],
    })

    expect(problemMessageKey(error)).toBe('problems:validationFailed')
    expect(translateProblem(error, i18n.t.bind(i18n))).toBe('Review the highlighted fields and try again.')
    const field = fieldProblemFor(error, '/email')
    expect(translateFieldProblem(field, i18n.t.bind(i18n))).toBe('Enter a valid email address.')
    expect(translateProblem(new Error('private'), i18n.t.bind(i18n))).toBe('Something went wrong. Try again.')
  })

  it('selects Chinese resources and synchronizes document metadata', async () => {
    await i18n.changeLanguage('zh-CN')
    document.documentElement.lang = i18n.language
    expect(i18n.t('common:home')).toBe('主页')
  })

  it('requires both stable identity and HTTP status for auth control flow', () => {
    const problem = (type: string, status: number, code: string) => new ApiProblemError({
      type,
      title: 'diagnostic',
      status,
      code,
    })

    expect(isUnauthenticated(problem('/problems/unauthenticated', 401, 'unauthenticated'))).toBe(true)
    expect(isUnauthenticated(problem('/problems/unauthenticated', 503, 'unauthenticated'))).toBe(false)
    expect(isInvalidSetupToken(problem('/problems/invalid-setup-token', 403, 'invalid_setup_token'))).toBe(true)
    expect(isInvalidSetupToken(problem('/problems/invalid-setup-token', 409, 'invalid_setup_token'))).toBe(false)
    expect(isSetupComplete(problem('/problems/setup-complete', 409, 'setup_complete'))).toBe(true)
    expect(isSetupComplete(problem('/problems/setup-complete', 503, 'setup_complete'))).toBe(false)
  })
})
