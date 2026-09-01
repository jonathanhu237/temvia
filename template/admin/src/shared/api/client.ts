import {
	loginInputSchema,
	passwordResetAcceptedSchema,
	passwordResetCompleteInputSchema,
	passwordResetRequestInputSchema,
  problemDetailsSchema,
  setupInputSchema,
  setupResponseSchema,
  setupStatusSchema,
  userEnvelopeSchema,
  type ProblemDetails,
  type SetupStatus,
  type User,
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
	logout(signal?: AbortSignal): Promise<void>
	requestPasswordReset(input: { email: string; locale: 'en' | 'zh-CN' }, signal?: AbortSignal): Promise<void>
	completePasswordReset(input: { token: string; password: string; locale: 'en' | 'zh-CN' }, signal?: AbortSignal): Promise<void>
}

interface RequestOptions {
  method?: 'GET' | 'POST'
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
      const result = await request('/api/auth/login', userEnvelopeSchema, { method: 'POST', body, signal, expectedStatus: 200 })
      return result.user
    },
    me: async (signal) => {
      const result = await request('/api/auth/me', userEnvelopeSchema, { signal, expectedStatus: 200 })
      return result.user
    },
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
  }
}
