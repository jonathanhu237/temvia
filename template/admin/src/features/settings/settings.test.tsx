import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailSettingsPage } from './email-settings-page'
import { ApiProblemError, type ApiClient } from '@/shared/api/client'
import { clearAccessDrafts } from '@/features/access/drafts'
import { i18n, initializeI18n } from '@/shared/i18n'

function mockApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getSetupStatus: vi.fn(),
    setup: vi.fn(),
    login: vi.fn(),
    me: vi.fn(),
    logout: vi.fn(),
    requestPasswordReset: vi.fn(),
    completePasswordReset: vi.fn(),
    ...overrides,
  }
}

function renderWithQueryClient(element: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>)
}

describe('email settings page', () => {
  beforeEach(async () => {
    HTMLElement.prototype.hasPointerCapture ??= () => false
    HTMLElement.prototype.setPointerCapture ??= () => undefined
    HTMLElement.prototype.releasePointerCapture ??= () => undefined
    HTMLElement.prototype.scrollIntoView ??= () => undefined
    await initializeI18n()
    await i18n.changeLanguage('en')
    clearAccessDrafts()
  })

  it('requires an explicit language on the first save and sends tests to the administrator', async () => {
    const saveEmailSettings = vi.fn()
    const testEmailSettings = vi.fn().mockResolvedValue(undefined)
    const api = mockApi({
      getEmailSettings: vi.fn().mockResolvedValue({ configured: false, passwordSet: false, revision: 0 }),
      saveEmailSettings,
      testEmailSettings,
    })
    const user = userEvent.setup()
    renderWithQueryClient(<EmailSettingsPage api={api} defaultRecipient="admin@example.com" />)

    expect(await screen.findByRole('heading', { name: 'System settings' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText('Choose a language')).toBeVisible()
    expect(screen.getByText('The test email will be sent to admin@example.com.')).toBeVisible()
    expect(screen.queryByLabelText('Recipient')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('SMTP host'), 'mailpit')
    await user.type(screen.getByLabelText('From address'), 'no-reply@example.com')
    await user.type(screen.getByLabelText('From name'), 'Temvia')
    await user.click(screen.getByRole('combobox', { name: 'Default email language' }))
    await user.click(await screen.findByRole('option', { name: 'English' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Send test email' }))
    await waitFor(() => expect(testEmailSettings).toHaveBeenCalledWith(expect.objectContaining({ host: 'mailpit', defaultLocale: 'en', revision: 0 })))
    expect(saveEmailSettings).not.toHaveBeenCalled()
  })

  it('keeps fields and mutation controls unavailable to settings readers', async () => {
    const api = mockApi({
      getEmailSettings: vi.fn().mockResolvedValue({ configured: true, host: 'smtp.example.com', port: 587, security: 'starttls', username: 'mailer', passwordSet: true, fromAddress: 'no-reply@example.com', fromName: 'Temvia', defaultLocale: 'en', revision: 3 }),
    })
    renderWithQueryClient(<EmailSettingsPage api={api} defaultRecipient="admin@example.com" canWrite={false} />)

    const heading = await screen.findByRole('heading', { name: 'System settings' })
    expect(heading).toBeVisible()
    expect(screen.getByLabelText('SMTP host')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send test email' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Authentication' })).getByLabelText('Use SMTP authentication')).toBeDisabled()
  })

  it('keeps the draft on a conflict and lets the administrator load the latest settings', async () => {
    const saveEmailSettings = vi.fn().mockRejectedValue(new ApiProblemError({ type: '/problems/stale-revision', title: 'stale revision', status: 409, code: 'stale_revision' }))
    const getEmailSettings = vi.fn()
      .mockResolvedValueOnce({ configured: false, passwordSet: false, revision: 0 })
      .mockResolvedValueOnce({ configured: true, host: 'smtp.example.com', port: 587, security: 'starttls', username: '', passwordSet: false, fromAddress: 'no-reply@example.com', fromName: 'Temvia', defaultLocale: 'en', revision: 1 })
    const api = mockApi({ getEmailSettings, saveEmailSettings })
    const user = userEvent.setup()
    renderWithQueryClient(<EmailSettingsPage api={api} defaultRecipient="admin@example.com" />)

    await screen.findByRole('heading', { name: 'System settings' })
    await user.click(screen.getByRole('combobox', { name: 'Default email language' }))
    await user.click(await screen.findByRole('option', { name: 'English' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: 'Discard draft and reload' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Discard draft and reload' }))
    await waitFor(() => expect(getEmailSettings).toHaveBeenCalledTimes(2))
    expect(await screen.findByDisplayValue('smtp.example.com')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Discard draft and reload' })).not.toBeInTheDocument()
  })
})
