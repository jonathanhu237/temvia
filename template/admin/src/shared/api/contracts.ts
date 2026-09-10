import { z } from 'zod'

export const userSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string(),
    roles: z.array(z.lazy(() => roleSchema)).optional(),
    permissions: z.array(z.string()).optional(),
    superAdmin: z.boolean().optional(),
  })
  .strict()

export type User = z.infer<typeof userSchema>

export const userEnvelopeSchema = z
  .object({ user: userSchema })
  .strict()

export const permissionSchema = z.object({
  key: z.string(),
  resource: z.string(),
  action: z.string(),
  labelKey: z.string(),
  description: z.string(),
  dependencies: z.array(z.string()).optional(),
}).strict()

export const roleOptionSchema = z.object({ id: z.string().uuid(), name: z.string() }).strict()

export const roleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  system: z.string().optional(),
  permissions: z.array(z.string()),
  revision: z.number().int().positive(),
  assignmentCount: z.number().int().nonnegative().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).strict()

export type Role = z.infer<typeof roleSchema>
export type Permission = z.infer<typeof permissionSchema>
export type PermissionCombination = { key: string; labelKey: string; description: string; permissions: string[]; trigger?: string[] }
export type RoleOption = z.infer<typeof roleOptionSchema>

export const principalEnvelopeSchema = z.object({
  user: z.object({ id: z.string().uuid(), name: z.string(), email: z.string() }).strict(),
  roles: z.array(roleSchema),
  permissions: z.array(z.string()),
  superAdmin: z.boolean(),
}).strict()

export type Principal = z.infer<typeof principalEnvelopeSchema>
export const authEnvelopeSchema = z.union([userEnvelopeSchema, principalEnvelopeSchema])

export const rolesResponseSchema = z.object({
  roles: z.array(roleSchema),
  permissions: z.array(permissionSchema),
  combinations: z.array(z.object({ key: z.string(), labelKey: z.string(), description: z.string(), permissions: z.array(z.string()), trigger: z.array(z.string()).optional() }).strict()).optional(),
}).strict()

export const roleOptionsResponseSchema = z.object({ roles: z.array(roleOptionSchema) }).strict()

export const roleResponseSchema = z.object({ role: roleSchema }).strict()

export const accessUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  createdAt: z.string(),
  authVersion: z.number().int().positive(),
  roles: z.array(roleSchema),
}).strict()

export const usersResponseSchema = z.object({ users: z.array(accessUserSchema), nextCursor: z.string().optional() }).strict()
export const userRoleResponseSchema = z.object({ user: accessUserSchema }).strict()
export const invitationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  locale: z.enum(['en', 'zh-CN']),
  roles: z.array(roleSchema),
  expiresAt: z.string(),
  createdAt: z.string(),
  revision: z.number().int().positive(),
}).strict()
export type Invitation = z.infer<typeof invitationSchema>
export const invitationsResponseSchema = z.object({ invitations: z.array(invitationSchema), nextCursor: z.string().optional() }).strict()
export const invitationResponseSchema = z.object({ invitation: invitationSchema }).strict()

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
  .object({ email: z.string() })
  .strict()

export const passwordResetCompleteInputSchema = z
  .object({ token: z.string(), password: z.string() })
  .strict()

export const roleMutationInputSchema = z.object({
  name: z.string(),
  description: z.string(),
  permissions: z.array(z.string()),
  revision: z.number().int().nonnegative().optional(),
}).strict()
export const assignmentInputSchema = z.object({ roleIds: z.array(z.string().uuid()), authVersion: z.number().int().positive() }).strict()
export const invitationInputSchema = z.object({ name: z.string(), email: z.string(), roleIds: z.array(z.string().uuid()) }).strict()
export const invitationAcceptanceInputSchema = z.object({ token: z.string(), password: z.string() }).strict()

export const emailSettingsSchema = z.object({
  configured: z.boolean(),
  host: z.string().optional(),
  port: z.number().int().optional(),
  security: z.enum(['none', 'starttls', 'tls']).optional(),
  username: z.string().optional(),
  passwordSet: z.boolean(),
  fromAddress: z.string().optional(),
  fromName: z.string().optional(),
  defaultLocale: z.enum(['en', 'zh-CN']).optional(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().optional(),
}).strict()
export type EmailSettings = z.infer<typeof emailSettingsSchema>
export const emailSettingsResponseSchema = z.object({ email: emailSettingsSchema }).strict()
export const operationalWarningsSchema = z.object({ warnings: z.array(z.object({ key: z.string(), severity: z.string() }).strict()) }).strict()

export const systemIdentitySchema = z.object({
  systemName: z.string(),
  iconUrl: z.string(),
  hasCustomIcon: z.boolean(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().optional(),
}).strict()
export type SystemIdentity = z.infer<typeof systemIdentitySchema>
export const systemIdentityResponseSchema = systemIdentitySchema

export const operationActorSchema = z.object({ id: z.string().optional(), name: z.string().optional(), email: z.string().optional(), kind: z.string().optional(), label: z.string().optional() }).strict()
export const operationLogSchema = z.object({
  id: z.string().uuid(),
  actor: operationActorSchema,
  action: z.string(),
  objectType: z.string(),
  objectId: z.string().optional(),
  result: z.enum(['success', 'failure']),
  occurredAt: z.string(),
  sourceIp: z.string().optional(),
  attemptedAccount: z.string().optional(),
  details: z.record(z.string(), z.unknown()),
}).strict()
export type OperationLog = z.infer<typeof operationLogSchema>
export const operationLogsResponseSchema = z.object({ logs: z.array(operationLogSchema), nextCursor: z.string().optional() }).strict()
export const operationLogResponseSchema = z.object({ log: operationLogSchema }).strict()
export const operationLogStatusSchema = z.object({ state: z.enum(['unknown', 'healthy', 'failed', 'recovered']), failureCount: z.number().int().nonnegative(), lastFailureAt: z.string().optional(), lastSuccessAt: z.string().optional() }).strict()
export const operationLogRetentionSchema = z.object({ retentionDays: z.number().int(), revision: z.number().int().nonnegative(), updatedAt: z.string().optional() }).strict()

export const passwordResetAcceptedSchema = z
  .object({ status: z.literal('accepted') })
  .strict()

export const sessionStatusSchema = z
  .object({ status: z.literal('ok') })
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

export const onlineUsersResponseSchema = z.object({ users: z.array(z.object({
  id: z.string().uuid(), name: z.string(), email: z.string(),
  lastSeenAt: z.string().datetime(), sessionCount: z.number().int().positive(),
})) })
export type OnlineUser = z.infer<typeof onlineUsersResponseSchema>['users'][number]
