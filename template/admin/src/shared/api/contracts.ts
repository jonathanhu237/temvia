import { z } from 'zod'

export const userSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string(),
  })
  .strict()

export type User = z.infer<typeof userSchema>

export const userEnvelopeSchema = z
  .object({ user: userSchema })
  .strict()

export const setupStatusSchema = z
  .object({ status: z.enum(['required', 'complete']) })
  .strict()

export type SetupStatus = z.infer<typeof setupStatusSchema>

export const setupResponseSchema = z
  .object({ status: z.literal('complete') })
  .strict()

export const setupInputSchema = z
  .object({
    token: z.string(),
    name: z.string(),
    email: z.string(),
    password: z.string(),
  })
  .strict()

export const loginInputSchema = z
  .object({ email: z.string(), password: z.string() })
  .strict()

export const passwordResetRequestInputSchema = z
  .object({ email: z.string(), locale: z.enum(['en', 'zh-CN']) })
  .strict()

export const passwordResetCompleteInputSchema = z
  .object({ token: z.string(), password: z.string(), locale: z.enum(['en', 'zh-CN']) })
  .strict()

export const passwordResetAcceptedSchema = z
  .object({ status: z.literal('accepted') })
  .strict()

export const fieldProblemSchema = z
  .object({
    pointer: z.string(),
    code: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

export const problemDetailsSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    code: z.string().optional(),
    detail: z.string().optional(),
    instance: z.string().optional(),
    errors: z.array(fieldProblemSchema).optional(),
  })
  .passthrough()

export type ProblemDetails = z.infer<typeof problemDetailsSchema>
export type FieldProblem = z.infer<typeof fieldProblemSchema>
