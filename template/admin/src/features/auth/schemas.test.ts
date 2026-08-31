import { describe, expect, it } from 'vitest'
import {
  loginFormSchema,
  normalizeLoginValues,
  normalizeSetupValues,
  setupFormSchema,
} from './schemas'

const password = 'correct horse battery'

describe('auth form schemas', () => {
  it('normalizes names and email identifiers but keeps password whitespace', () => {
    const values = {
      name: '  Jo\u0301  ',
      email: '  admin@example.com  ',
      password,
      passwordConfirmation: password,
    }
    expect(setupFormSchema.safeParse(values).success).toBe(true)
    expect(normalizeSetupValues(values)).toEqual({
      name: 'Jó',
      email: 'admin@example.com',
      password,
    })
    expect(normalizeLoginValues({ email: values.email, password: ` ${password} ` })).toEqual({
      email: 'admin@example.com',
      password: ` ${password} `,
    })
  })

  it('checks code point length, controls, email shape and confirmation', () => {
    const result = setupFormSchema.safeParse({
      name: `\u0000${'😀'.repeat(101)}`,
      email: 'bad@@example..com',
      password: 'short',
      passwordConfirmation: 'different',
    })
    expect(result.success).toBe(false)
    if (result.success) return
    const codes = result.error.issues.map((issue) => issue.message)
    expect(codes).toEqual(expect.arrayContaining(['invalid_name', 'invalid_email', 'invalid_password', 'password_mismatch']))
  })

  it('accepts unicode passwords based on code points', () => {
    expect(loginFormSchema.safeParse({ email: 'admin@example.com', password: '😀'.repeat(15) }).success).toBe(true)
    expect(loginFormSchema.safeParse({ email: 'admin@example.com', password: '😀'.repeat(14) }).success).toBe(false)
  })

  it('compares passwords after the same NFC normalization sent to the API', () => {
    const result = setupFormSchema.safeParse({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'a\u0301'.repeat(15),
      passwordConfirmation: 'á'.repeat(15),
    })
    expect(result.success).toBe(true)
  })
})
