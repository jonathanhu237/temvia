import { describe, expect, it } from 'vitest'
import { ApiProblemError } from './client'
import {
  fieldProblemFor,
  fieldMessageKey,
  isInvalidPasswordResetToken,
  isInvalidSetupToken,
  isSetupComplete,
  isUnauthenticated,
  problemMessageKey,
  translateFieldProblem,
  translateClientFieldError,
  translatePasswordResetProblem,
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

  it.each([
    ['en', 'Use a password between 8 and 128 characters with uppercase, lowercase, a number, and a special character.', 'invalid_password'],
    ['zh-CN', '请输入 8 到 128 个字符的密码，并至少包含大写字母、小写字母、数字和特殊符号。', 'invalid_password'],
  ] as const)('localizes client field codes in %s', async (locale, message, code) => {
    await i18n.changeLanguage(locale)
    expect(fieldMessageKey(code)).toBe('problems:fields.invalidPassword')
    expect(translateClientFieldError({ type: 'custom', message: code }, i18n.t.bind(i18n))).toBe(message)
  })

  it.each([
    ['en', 'Enter a non-empty password of at most 128 characters.'],
    ['zh-CN', '请输入非空且不超过 128 个字符的密码。'],
  ] as const)('localizes the login password code in %s', async (locale, message) => {
    await i18n.changeLanguage(locale)
    expect(fieldMessageKey('invalid_login_password')).toBe('problems:fields.invalidLoginPassword')
    expect(translateClientFieldError({ type: 'custom', message: 'invalid_login_password' }, i18n.t.bind(i18n))).toBe(message)
  })

  it('uses the localized generic field message for unknown or missing client codes', async () => {
    await i18n.changeLanguage('zh-CN')
    const translate = i18n.t.bind(i18n)
    expect(translateClientFieldError({ type: 'custom', message: 'unknown_code' }, translate)).toBe('请输入有效的值。')
    expect(translateClientFieldError({ type: 'custom' }, translate)).toBe('请输入有效的值。')
    expect(translateClientFieldError(undefined, translate)).toBeUndefined()
  })

  it.each([
    ['en', 'Too many password reset requests. Wait a moment and try again.'],
    ['zh-CN', '密码重置请求次数过多，请稍后重试。'],
  ] as const)('uses recovery-specific rate-limit copy in %s', async (locale, message) => {
    await i18n.changeLanguage(locale)
    const error = new ApiProblemError({
      type: '/problems/rate-limited',
      title: 'Too many requests',
      status: 429,
      code: 'rate_limited',
    })
    expect(translatePasswordResetProblem(error, i18n.t.bind(i18n))).toBe(message)
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
    expect(isInvalidPasswordResetToken(problem('/problems/invalid-password-reset-token', 403, 'invalid_password_reset_token'))).toBe(true)
    expect(isInvalidPasswordResetToken(problem('/problems/invalid-password-reset-token', 500, 'invalid_password_reset_token'))).toBe(false)
  })
})
