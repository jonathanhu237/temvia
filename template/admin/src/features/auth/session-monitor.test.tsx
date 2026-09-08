import { QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, expect, it, vi } from 'vitest'
import { SessionMonitor } from './session-monitor'
import { ApiProblemError, ApiTransportError, type ApiClient } from '@/shared/api/client'
import { createAppQueryClient } from '@/app/query-client'
import { i18n, initializeI18n } from '@/shared/i18n'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(async () => {
 await initializeI18n()
 await i18n.changeLanguage('en')
})

it('redirects and clears cached private data after revocation', async () => {
 navigate.mockClear()
 const client = createAppQueryClient()
 client.setQueryData(['operation-logs', 'user'], { private: true })
 const api = { checkSession: vi.fn().mockRejectedValue(new ApiProblemError({ type: '/problems/unauthenticated', title: 'Unauthenticated', status: 401, code: 'unauthenticated' })) } as unknown as ApiClient
 render(<QueryClientProvider client={client}><SessionMonitor api={api} userID="user" /></QueryClientProvider>)
 await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login', replace: true }))
 expect(client.getQueryData(['operation-logs', 'user'])).toBeUndefined()
})
it('does not sign out users during a network interruption', async () => {
 navigate.mockClear()
 const client = createAppQueryClient()
 const checkSession = vi.fn().mockRejectedValue(new ApiTransportError('offline'))
 render(<QueryClientProvider client={client}><SessionMonitor api={{ checkSession } as unknown as ApiClient} userID="user" /></QueryClientProvider>)
 await waitFor(() => expect(client.getQueryState(['session-monitor', 'user'])?.status).toBe('error'))
 expect(navigate).not.toHaveBeenCalled()
})

it('announces an expired session before redirecting', async () => {
 navigate.mockClear()
 const client = createAppQueryClient()
 const expired = new ApiProblemError({ type: '/problems/unauthenticated', title: 'Unauthenticated', status: 401, code: 'unauthenticated' })
 const checkSession = vi.fn().mockRejectedValue(expired)
 vi.clearAllMocks()
 render(<QueryClientProvider client={client}><SessionMonitor api={{ checkSession } as unknown as ApiClient} userID="user" /></QueryClientProvider>)
 await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login', replace: true }))
 expect(toast.error).toHaveBeenCalledWith('Your session has expired. Sign in again.')
})
