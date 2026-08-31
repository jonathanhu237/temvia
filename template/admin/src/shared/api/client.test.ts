import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { ApiProblemError, ApiProtocolError, createApiClient } from './client'
import { server } from '@/test/msw'

const api = createApiClient()
const user = { id: '00000000-0000-4000-8000-000000000001', name: 'Admin', email: 'admin@example.com' }

describe('Fetch API boundary', () => {
  it('validates endpoint responses and sends same-origin JSON headers', async () => {
    let request: Request | undefined
    server.use(http.get('/api/setup/status', ({ request: incoming }) => {
      request = incoming
      return HttpResponse.json({ status: 'required' }, { headers: { 'Cache-Control': 'no-store' } })
    }))

    await expect(api.getSetupStatus()).resolves.toEqual({ status: 'required' })
    expect(request?.credentials).toBe('same-origin')
    expect(request?.headers.get('accept')).toContain('application/problem+json')
    expect(request?.headers.get('cache-control')).toBe('no-store')
  })

  it('parses RFC 9457 responses into a typed problem error', async () => {
    server.use(http.post('/api/auth/login', () => HttpResponse.json({
      type: '/problems/invalid-credentials',
      title: 'Invalid credentials',
      status: 401,
      code: 'invalid_credentials',
    }, { status: 401, headers: { 'Content-Type': 'application/problem+json' } })))

    try {
      await api.login({ email: user.email, password: 'wrong password 123' })
      throw new Error('expected invalid credentials')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiProblemError)
      expect((error as ApiProblemError).problem.code).toBe('invalid_credentials')
      expect((error as ApiProblemError).problem.status).toBe(401)
    }
  })

  it('rejects a successful response with the wrong media type and accepts logout 204', async () => {
    server.use(
      http.get('/api/auth/me', () => new HttpResponse('{}', { headers: { 'Content-Type': 'text/plain' } })),
      http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
    )
    await expect(api.me()).rejects.toBeInstanceOf(ApiProtocolError)
    await expect(api.logout()).resolves.toBeUndefined()
  })

  it('rejects a valid body returned with the wrong success status', async () => {
    server.use(http.get('/api/setup/status', () => HttpResponse.json({ status: 'required' }, { status: 201 })))
    await expect(api.getSetupStatus()).rejects.toBeInstanceOf(ApiProtocolError)
  })
})
