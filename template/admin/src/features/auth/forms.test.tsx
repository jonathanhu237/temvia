import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from './login-form'
import { SetupForm } from './setup-form'
import { ApiProblemError, type ApiClient } from '@/shared/api/client'
import { captureSetupAuthority, getSetupAuthority } from '@/shared/bootstrap/setup-authority'
import { i18n, initializeI18n } from '@/shared/i18n'

const token = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-'.slice(0, 43)

function renderWithQueryClient(element: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>)
}

function mockApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getSetupStatus: vi.fn(),
    setup: vi.fn(),
    login: vi.fn(),
    me: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  }
}

describe('authentication forms', () => {
  beforeEach(async () => {
    await initializeI18n()
    await i18n.changeLanguage('en')
  })

  it('allows paste, exposes autocomplete semantics and sends normalized setup data', async () => {
    const user = userEvent.setup()
    const api = mockApi({ setup: vi.fn().mockResolvedValue(undefined) })
    const onSuccess = vi.fn()
    renderWithQueryClient(<SetupForm api={api} token={token} onSuccess={onSuccess} />)

    const name = screen.getByLabelText('Name')
    const email = screen.getByLabelText('Email')
    const password = screen.getByLabelText('Password', { exact: true })
    const confirmation = screen.getByLabelText('Confirm password')
    expect(name).toHaveAttribute('autocomplete', 'name')
    expect(email).toHaveAttribute('autocomplete', 'email')
    expect(password).toHaveAttribute('autocomplete', 'new-password')
    await user.click(name)
    await user.paste('  Admin  ')
    await user.type(email, ' admin@example.com ')
    await user.type(password, 'correct horse battery')
    await user.type(confirmation, 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Create administrator' }))

    await waitFor(() => expect(api.setup).toHaveBeenCalledWith({
      token,
      name: 'Admin',
      email: 'admin@example.com',
      password: 'correct horse battery',
    }))
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it('shows localized invalid credentials without exposing server diagnostics', async () => {
    const user = userEvent.setup()
    const api = mockApi({
      login: vi.fn().mockRejectedValue(new Error('private diagnostic')),
    })
    renderWithQueryClient(<LoginForm api={api} onSuccess={vi.fn()} />)
    await user.type(screen.getByLabelText('Email'), 'admin@example.com')
    await user.type(screen.getByLabelText('Password', { exact: true }), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
    expect(screen.queryByText('private diagnostic')).not.toBeInTheDocument()
  })

  it('toggles password visibility with an accessible control', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    renderWithQueryClient(<LoginForm api={api} onSuccess={vi.fn()} />)
    const password = screen.getByLabelText('Password', { exact: true })
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
  })

  it('maps a setup-complete race to login and clears in-memory authority', async () => {
    const user = userEvent.setup()
    captureSetupAuthority(
      { pathname: '/setup', search: '', hash: `#token=${token}` },
      { state: null, replaceState: () => undefined },
    )
    const api = mockApi({
      setup: vi.fn().mockRejectedValue(new ApiProblemError({
        type: '/problems/setup-complete',
        title: 'Setup complete',
        status: 409,
        code: 'setup_complete',
      })),
    })
    const onSuccess = vi.fn()
    const onSetupComplete = vi.fn()
    renderWithQueryClient(<SetupForm api={api} token={token} onSuccess={onSuccess} onSetupComplete={onSetupComplete} />)

    await user.type(screen.getByLabelText('Name'), 'Admin')
    await user.type(screen.getByLabelText('Email'), 'admin@example.com')
    await user.type(screen.getByLabelText('Password', { exact: true }), 'correct horse battery')
    await user.type(screen.getByLabelText('Confirm password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Create administrator' }))

    await waitFor(() => expect(onSetupComplete).toHaveBeenCalledOnce())
    expect(onSuccess).not.toHaveBeenCalled()
    expect(getSetupAuthority()).toBeUndefined()
  })

  it('applies a server field pointer and focuses the actionable control', async () => {
    const user = userEvent.setup()
    const api = mockApi({
      setup: vi.fn().mockRejectedValue(new ApiProblemError({
        type: '/problems/validation-failed',
        title: 'Validation failed',
        status: 422,
        code: 'validation_failed',
        errors: [{ pointer: '/email', code: 'invalid_email' }],
      })),
    })
    renderWithQueryClient(<SetupForm api={api} token={token} onSuccess={vi.fn()} />)

    await user.type(screen.getByLabelText('Name'), 'Admin')
    const email = screen.getByLabelText('Email')
    await user.type(email, 'admin@example.com')
    await user.type(screen.getByLabelText('Password', { exact: true }), 'correct horse battery')
    await user.type(screen.getByLabelText('Confirm password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Create administrator' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeVisible()
    await waitFor(() => expect(email).toHaveFocus())
  })

  it.each([
    ['/problems/rate-limited', 429, 'rate_limited', 'Too many sign in attempts. Wait a moment and try again.'],
    ['/problems/service-unavailable', 503, 'service_unavailable', 'A required service is temporarily unavailable. Try again shortly.'],
  ])('keeps important login failures visible for %s', async (type, status, code, message) => {
    const user = userEvent.setup()
    const api = mockApi({ login: vi.fn().mockRejectedValue(new ApiProblemError({ type, title: 'diagnostic', status, code })) })
    renderWithQueryClient(<LoginForm api={api} onSuccess={vi.fn()} />)
    await user.type(screen.getByLabelText('Email'), 'admin@example.com')
    await user.type(screen.getByLabelText('Password', { exact: true }), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })
})
