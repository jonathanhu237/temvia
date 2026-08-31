import { z } from 'zod'

function addIssue(ctx: z.RefinementCtx, path: string[], code: string): void {
  ctx.addIssue({ code: 'custom', path, message: code })
}

export function normalizeName(value: string): string {
  return value.normalize('NFC').trim()
}

export function normalizeEmail(value: string): string {
  return value.trim()
}

export function normalizePassword(value: string): string {
  return value.normalize('NFC')
}

function isControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return (codePoint >= 0 && codePoint <= 31) || (codePoint >= 127 && codePoint <= 159) || codePoint === 0x2028 || codePoint === 0x2029
  })
}

function validateName(value: string, ctx: z.RefinementCtx): void {
  const normalized = normalizeName(value)
  if (normalized.length === 0 || isControlCharacter(normalized) || Array.from(normalized).length > 100) {
    addIssue(ctx, ['name'], 'invalid_name')
  }
}

function validateEmail(value: string, ctx: z.RefinementCtx): void {
  const normalized = normalizeEmail(value)
  if (
    normalized.length === 0 ||
    normalized.length > 254 ||
    Array.from(normalized).some((character) => (character.codePointAt(0) ?? 0) > 127) ||
    !/^[^\s@]+@[^\s@]+$/.test(normalized) ||
    normalized.includes('..')
  ) {
    addIssue(ctx, ['email'], 'invalid_email')
  }
}

function validatePassword(value: string, ctx: z.RefinementCtx): void {
  const normalized = normalizePassword(value)
  const length = Array.from(normalized).length
  if (length < 15 || length > 128) {
    addIssue(ctx, ['password'], 'invalid_password')
  }
}

export const setupFormSchema = z
  .object({
    name: z.string(),
    email: z.string(),
    password: z.string(),
    passwordConfirmation: z.string(),
  })
  .superRefine((value, ctx) => {
    validateName(value.name, ctx)
    validateEmail(value.email, ctx)
    validatePassword(value.password, ctx)
    if (normalizePassword(value.password) !== normalizePassword(value.passwordConfirmation)) {
      addIssue(ctx, ['passwordConfirmation'], 'password_mismatch')
    }
  })

export type SetupFormValues = z.infer<typeof setupFormSchema>

export const loginFormSchema = z
  .object({ email: z.string(), password: z.string() })
  .superRefine((value, ctx) => {
    validateEmail(value.email, ctx)
    validatePassword(value.password, ctx)
  })

export type LoginFormValues = z.infer<typeof loginFormSchema>

export function normalizeSetupValues(values: SetupFormValues): { name: string; email: string; password: string } {
  return {
    name: normalizeName(values.name),
    email: normalizeEmail(values.email),
    password: normalizePassword(values.password),
  }
}

export function normalizeLoginValues(values: LoginFormValues): LoginFormValues {
  return {
    email: normalizeEmail(values.email),
    password: normalizePassword(values.password),
  }
}
