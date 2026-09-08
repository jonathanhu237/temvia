import {
	authEnvelopeSchema,
	loginInputSchema,
	assignmentInputSchema,
	invitationAcceptanceInputSchema,
	invitationInputSchema,
	invitationsResponseSchema,
	invitationResponseSchema,
	passwordResetAcceptedSchema,
	passwordResetCompleteInputSchema,
	passwordResetRequestInputSchema,
	emailSettingsResponseSchema,
	operationalWarningsSchema,
	operationLogRetentionSchema,
	operationLogResponseSchema,
	operationLogsResponseSchema,
	operationLogStatusSchema,
	problemDetailsSchema,
	roleMutationInputSchema,
	roleResponseSchema,
	rolesResponseSchema,
	roleOptionsResponseSchema,
	setupInputSchema,
  setupResponseSchema,
  setupStatusSchema,
	userRoleResponseSchema,
	usersResponseSchema,
  type ProblemDetails,
  type SetupStatus,
  type User,
  type Role,
  type Permission,
  type Invitation,
	  type RoleOption,
  type EmailSettings,
  type OperationLog,
} from './contracts'

export class ApiProblemError extends Error {
  readonly problem: ProblemDetails

  constructor(problem: ProblemDetails) {
    super(problem.title)
    this.name = 'ApiProblemError'
    this.problem = problem
  }
}

export class ApiProtocolError extends Error {
  constructor(message = 'The server returned an unexpected response.') {
    super(message)
    this.name = 'ApiProtocolError'
  }
}

export class ApiTransportError extends Error {
  readonly aborted: boolean

  constructor(message: string, options: { aborted?: boolean; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = 'ApiTransportError'
    this.aborted = options.aborted ?? false
  }
}

export interface ApiClient {
  getSetupStatus(signal?: AbortSignal): Promise<SetupStatus>
  setup(input: { token: string; name: string; email: string; password: string }, signal?: AbortSignal): Promise<void>
  login(input: { email: string; password: string }, signal?: AbortSignal): Promise<User>
  me(signal?: AbortSignal): Promise<User>
	getRoles?(signal?: AbortSignal): Promise<{ roles: Role[]; permissions: Permission[]; combinations?: Array<{ key: string; labelKey: string; description: string; permissions: string[]; trigger?: string[] }> }>
	getRoleOptions?(signal?: AbortSignal): Promise<{ roles: RoleOption[] }>
	getRole?(id: string, signal?: AbortSignal): Promise<Role>
	createRole?(input: { name: string; description: string; permissions: string[] }, signal?: AbortSignal): Promise<Role>
	replaceRole?(id: string, input: { name: string; description: string; permissions: string[]; revision: number }, signal?: AbortSignal): Promise<Role>
	deleteRole?(id: string, signal?: AbortSignal): Promise<void>
	getUsers?(options?: { cursor?: string; limit?: number; q?: string; roleId?: string; sort?: string; direction?: 'asc' | 'desc' }, signal?: AbortSignal): Promise<{ users: Array<{ id: string; name: string; email: string; createdAt: string; authVersion: number; roles: Role[] }>; nextCursor?: string }>
	replaceUserRoles?(id: string, input: { roleIds: string[]; authVersion: number }, signal?: AbortSignal): Promise<{ user: { id: string; name: string; email: string; createdAt: string; authVersion: number; roles: Role[] } }>
	getInvitations?(options?: { cursor?: string; limit?: number; q?: string; roleId?: string; status?: 'pending' | 'expired'; sort?: string; direction?: 'asc' | 'desc' }, signal?: AbortSignal): Promise<{ invitations: Invitation[]; nextCursor?: string }>
	createInvitation?(input: { name: string; email: string; roleIds: string[] }, signal?: AbortSignal): Promise<{ invitation: Invitation }>
	resendInvitation?(id: string, signal?: AbortSignal): Promise<{ invitation: Invitation }>
	revokeInvitation?(id: string, signal?: AbortSignal): Promise<void>
	acceptInvitation?(input: { token: string; password: string }, signal?: AbortSignal): Promise<void>
	logout(signal?: AbortSignal): Promise<void>
	requestPasswordReset(input: { email: string }, signal?: AbortSignal): Promise<void>
	completePasswordReset(input: { token: string; password: string }, signal?: AbortSignal): Promise<void>
	getEmailSettings?(signal?: AbortSignal): Promise<EmailSettings>
	saveEmailSettings?(input: { host: string; port: number; security: 'none' | 'starttls' | 'tls'; username: string; password?: string; clearPassword?: boolean; fromAddress: string; fromName: string; defaultLocale: 'en' | 'zh-CN'; revision: number }, signal?: AbortSignal): Promise<EmailSettings>
	testEmailSettings?(input: { host: string; port: number; security: 'none' | 'starttls' | 'tls'; username: string; password?: string; clearPassword?: boolean; fromAddress: string; fromName: string; defaultLocale: 'en' | 'zh-CN'; revision?: number; recipient: string }, signal?: AbortSignal): Promise<void>
	getOperationalWarnings?(signal?: AbortSignal): Promise<{ warnings: Array<{ key: string; severity: string }> }>
	getOperationLogStatus?(signal?: AbortSignal): Promise<{ state: 'unknown' | 'healthy' | 'failed' | 'recovered'; failureCount: number; lastFailureAt?: string; lastSuccessAt?: string }>
	getOperationLogs?(options?: { cursor?: string; limit?: number; from?: string; to?: string; actorId?: string; action?: string; objectType?: string; objectId?: string; result?: 'success' | 'failure' }, signal?: AbortSignal): Promise<{ logs: OperationLog[]; nextCursor?: string }>
	getOperationLog?(id: string, signal?: AbortSignal): Promise<OperationLog>
	getOperationLogRetention?(signal?: AbortSignal): Promise<{ retentionDays: number; revision: number; updatedAt?: string }>
	saveOperationLogRetention?(input: { retentionDays: number; revision: number }, signal?: AbortSignal): Promise<{ retentionDays: number; revision: number; updatedAt?: string }>
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  expectedStatus: number
}

const JSON_HEADERS = {
  Accept: 'application/json, application/problem+json',
  'Cache-Control': 'no-store',
}

async function request<T>(path: string, schema: { parse(value: unknown): T }, options: RequestOptions): Promise<T> {
  const headers = new Headers(JSON_HEADERS)
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    const aborted = (error instanceof DOMException || error instanceof Error) && error.name === 'AbortError'
    throw new ApiTransportError(aborted ? 'The request was cancelled.' : 'The network request failed.', {
      aborted,
      cause: error,
    })
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/problem+json') {
      throw new ApiProtocolError()
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new ApiProtocolError('The server returned malformed error data.')
    }
    const problem = problemDetailsSchema.safeParse(body)
    if (!problem.success || problem.data.status !== response.status) {
      throw new ApiProtocolError()
    }
    throw new ApiProblemError(problem.data)
  }

  if (response.status !== options.expectedStatus) {
    throw new ApiProtocolError()
  }

  if (response.status === 204) {
    return undefined as T
  }
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new ApiProtocolError()
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiProtocolError('The server returned malformed data.')
  }
  try {
    return schema.parse(body)
  } catch {
    throw new ApiProtocolError('The server returned data in an unexpected shape.')
  }
}

export function createApiClient(): ApiClient {
  return {
    getSetupStatus: (signal) => request('/api/setup/status', setupStatusSchema, { signal, expectedStatus: 200 }),
    setup: async (input, signal) => {
      const body = setupInputSchema.parse(input)
      await request('/api/setup', setupResponseSchema, { method: 'POST', body, signal, expectedStatus: 201 })
    },
    login: async (input, signal) => {
		const body = loginInputSchema.parse(input)
		const result = await request('/api/auth/login', authEnvelopeSchema, { method: 'POST', body, signal, expectedStatus: 200 })
		return 'roles' in result ? { ...result.user, roles: result.roles, permissions: result.permissions, superAdmin: result.superAdmin } : result.user
	},
		me: async (signal) => {
			const result = await request('/api/auth/me', authEnvelopeSchema, { signal, expectedStatus: 200 })
			return 'roles' in result ? { ...result.user, roles: result.roles, permissions: result.permissions, superAdmin: result.superAdmin } : result.user
    },
		getRoles: async (signal) => request('/api/roles', rolesResponseSchema, { signal, expectedStatus: 200 }),
		getRoleOptions: async (signal) => request('/api/access/role-options', roleOptionsResponseSchema, { signal, expectedStatus: 200 }),
		getRole: async (id, signal) => (await request(`/api/roles/${encodeURIComponent(id)}`, roleResponseSchema, { signal, expectedStatus: 200 })).role,
		createRole: async (input, signal) => (await request('/api/roles', roleResponseSchema, { method: 'POST', body: roleMutationInputSchema.parse(input), signal, expectedStatus: 201 })).role,
		replaceRole: async (id, input, signal) => (await request(`/api/roles/${encodeURIComponent(id)}`, roleResponseSchema, { method: 'PUT', body: roleMutationInputSchema.parse(input), signal, expectedStatus: 200 })).role,
		deleteRole: async (id, signal) => { await request(`/api/roles/${encodeURIComponent(id)}`, { parse: (value: unknown) => value as undefined }, { method: 'DELETE', signal, expectedStatus: 204 }) },
		getUsers: async (options, signal) => {
			const query = new URLSearchParams(); if (options?.cursor) query.set('cursor', options.cursor); if (options?.limit !== undefined) query.set('limit', String(options.limit)); if (options?.q) query.set('q', options.q); if (options?.roleId) query.set('roleId', options.roleId); if (options?.sort) query.set('sort', options.sort); if (options?.direction) query.set('direction', options.direction)
			return request(`/api/users${query.size ? `?${query.toString()}` : ''}`, usersResponseSchema, { signal, expectedStatus: 200 })
		},
		replaceUserRoles: async (id, input, signal) => request(`/api/users/${encodeURIComponent(id)}/roles`, userRoleResponseSchema, { method: 'PUT', body: assignmentInputSchema.parse(input), signal, expectedStatus: 200 }),
		getInvitations: async (options, signal) => {
			const query = new URLSearchParams(); if (options?.cursor) query.set('cursor', options.cursor); if (options?.limit !== undefined) query.set('limit', String(options.limit)); if (options?.q) query.set('q', options.q); if (options?.roleId) query.set('roleId', options.roleId); if (options?.status) query.set('status', options.status); if (options?.sort) query.set('sort', options.sort); if (options?.direction) query.set('direction', options.direction)
			return request(`/api/user-invitations${query.size ? `?${query.toString()}` : ''}`, invitationsResponseSchema, { signal, expectedStatus: 200 })
		},
		createInvitation: async (input, signal) => request('/api/user-invitations', invitationResponseSchema, { method: 'POST', body: invitationInputSchema.parse(input), signal, expectedStatus: 201 }),
		resendInvitation: async (id, signal) => request(`/api/user-invitations/${encodeURIComponent(id)}/resend`, invitationResponseSchema, { method: 'POST', signal, expectedStatus: 202 }),
		revokeInvitation: async (id, signal) => { await request(`/api/user-invitations/${encodeURIComponent(id)}`, { parse: (value: unknown) => value as undefined }, { method: 'DELETE', signal, expectedStatus: 204 }) },
		acceptInvitation: async (input, signal) => { await request('/api/auth/invitations/accept', { parse: (value: unknown) => value as undefined }, { method: 'POST', body: invitationAcceptanceInputSchema.parse(input), signal, expectedStatus: 204 }) },
    logout: async (signal) => {
      await request('/api/auth/logout', { parse: (value: unknown) => value as undefined }, { method: 'POST', signal, expectedStatus: 204 })
    },
    requestPasswordReset: async (input, signal) => {
		const body = passwordResetRequestInputSchema.parse(input)
      await request('/api/auth/password-reset/request', passwordResetAcceptedSchema, { method: 'POST', body, signal, expectedStatus: 202 })
    },
    completePasswordReset: async (input, signal) => {
		const body = passwordResetCompleteInputSchema.parse(input)
	      await request('/api/auth/password-reset/complete', { parse: (value: unknown) => value as undefined }, { method: 'POST', body, signal, expectedStatus: 204 })
	    },
		getEmailSettings: async (signal) => (await request('/api/settings/email', emailSettingsResponseSchema, { signal, expectedStatus: 200 })).email,
		saveEmailSettings: async (input, signal) => (await request('/api/settings/email', emailSettingsResponseSchema, { method: 'PUT', body: input, signal, expectedStatus: 200 })).email,
		testEmailSettings: async (input, signal) => { await request('/api/settings/email/test', passwordResetAcceptedSchema, { method: 'POST', body: input, signal, expectedStatus: 202 }) },
		getOperationalWarnings: async (signal) => request('/api/operational-warnings', operationalWarningsSchema, { signal, expectedStatus: 200 }),
		getOperationLogStatus: async (signal) => request('/api/operation-logs/status', operationLogStatusSchema, { signal, expectedStatus: 200 }),
		getOperationLogs: async (options, signal) => {
			const query = new URLSearchParams(); if (options?.cursor) query.set('cursor', options.cursor); if (options?.limit !== undefined) query.set('limit', String(options.limit)); if (options?.from) query.set('from', options.from); if (options?.to) query.set('to', options.to); if (options?.actorId) query.set('actorId', options.actorId); if (options?.action) query.set('action', options.action); if (options?.objectType) query.set('objectType', options.objectType); if (options?.objectId) query.set('objectId', options.objectId); if (options?.result) query.set('result', options.result)
			return request(`/api/operation-logs${query.size ? `?${query.toString()}` : ''}`, operationLogsResponseSchema, { signal, expectedStatus: 200 })
		},
		getOperationLog: async (id, signal) => (await request(`/api/operation-logs/${encodeURIComponent(id)}`, operationLogResponseSchema, { signal, expectedStatus: 200 })).log,
		getOperationLogRetention: async (signal) => request('/api/settings/operation-log', operationLogRetentionSchema, { signal, expectedStatus: 200 }),
		saveOperationLogRetention: async (input, signal) => (await request('/api/settings/operation-log', operationLogRetentionSchema, { method: 'PUT', body: input, signal, expectedStatus: 200 })),
  }
}
