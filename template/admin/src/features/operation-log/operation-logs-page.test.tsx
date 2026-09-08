import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OperationLogsPage } from './operation-logs-page'
import type { ApiClient } from '@/shared/api/client'
import { i18n, initializeI18n } from '@/shared/i18n'

function mockApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getSetupStatus: vi.fn(), setup: vi.fn(), login: vi.fn(), me: vi.fn(), logout: vi.fn(), requestPasswordReset: vi.fn(), completePasswordReset: vi.fn(),
    ...overrides,
  }
}

function renderWithQueryClient(element: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>)
}

describe('operation log filters', () => {
  beforeEach(async () => {
    await initializeI18n()
    await i18n.changeLanguage('en')
  })

  it('accepts a UUIDv7 actor filter and sends it to the API', async () => {
    const getOperationLogs = vi.fn().mockResolvedValue({ logs: [] })
    const api = mockApi({ getOperationLogs })
    const user = userEvent.setup()
    renderWithQueryClient(<OperationLogsPage api={api} userID="user-1" />)

    await screen.findByRole('heading', { name: 'Operation history' })
    const actor = screen.getByLabelText('Actor ID')
    const actorID = '019535d9-3df7-79fb-b466-fa907fa17f9e'
    await user.type(actor, actorID)
    await waitFor(() => expect(getOperationLogs).toHaveBeenLastCalledWith(expect.objectContaining({ actorId: actorID }), expect.anything()))
    expect(screen.queryByText('Enter a valid actor UUID.')).not.toBeInTheDocument()
  })

  it('shows invalid actor input instead of an endless loading state and makes no request', async () => {
    const getOperationLogs = vi.fn().mockResolvedValue({ logs: [] })
    const api = mockApi({ getOperationLogs })
    const user = userEvent.setup()
    renderWithQueryClient(<OperationLogsPage api={api} userID="user-1" />)

    await screen.findByRole('heading', { name: 'Operation history' })
    const initialCalls = getOperationLogs.mock.calls.length
    await user.type(screen.getByLabelText('Actor ID'), 'not-a-uuid')
    expect((await screen.findAllByText('Enter a valid actor UUID.'))[0]).toBeVisible()
    expect(screen.getByRole('status')).toBeVisible()
    expect(getOperationLogs).toHaveBeenCalledTimes(initialCalls)
  })

  it('keeps filters mounted while the log request fails', async () => {
    const getOperationLogs = vi.fn().mockRejectedValue(new Error('unavailable'))
    const api = mockApi({ getOperationLogs })
    renderWithQueryClient(<OperationLogsPage api={api} userID="user-1" />)

    expect(await screen.findByText('The API could not load operation history. Refresh the page to try again.')).toBeVisible()
    expect(screen.getByLabelText('Action')).toBeVisible()
    expect(screen.getByLabelText('Actor ID')).toBeVisible()
  })
})
