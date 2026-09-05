import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailSettingsPage } from './email-settings-page'
import { ApiProblemError, type ApiClient } from '@/shared/api/client'
import { clearAccessDrafts } from '@/features/access/drafts'
import { i18n, initializeI18n } from '@/shared/i18n'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

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
    vi.clearAllMocks()
    HTMLElement.prototype.hasPointerCapture ??= () => false
    HTMLElement.prototype.setPointerCapture ??= () => undefined
    HTMLElement.prototype.releasePointerCapture ??= () => undefined
    HTMLElement.prototype.scrollIntoView ??= () => undefined
    await initializeI18n()
    await i18n.changeLanguage('en')
    clearAccessDrafts()
  })

  it('requires an explicit language on the first save and lets the administrator choose the test recipient', async () => {
    const saveEmailSettings = vi.fn()
    const testEmailSettings = vi.fn().mockResolvedValue(undefined)
    const api = mockApi({
      getEmailSettings: vi.fn().mockResolvedValue({ configured: false, passwordSet: false, revision: 0 }),
      saveEmailSettings,
      testEmailSettings,
    })
    const user = userEvent.setup()
    renderWithQueryClient(<EmailSettingsPage api={api} />)

    expect(await screen.findByRole('heading', { name: 'System settings' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText('Choose a language')).toBeVisible()
    expect(screen.queryByLabelText('Recipient email')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('SMTP host'), 'mailpit')
    await user.type(screen.getByLabelText('From address'), 'no-reply@example.com')
    await user.type(screen.getByLabelText('From name'), 'Temvia')
    await user.click(screen.getByRole('combobox', { name: 'Default email language' }))
    await user.click(await screen.findByRole('option', { name: 'English' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Send test email' }))
    const dialog = await screen.findByRole('dialog', { name: 'Send test email' })
    await user.type(within(dialog).getByLabelText('Recipient email'), 'real@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Send test email' }))
    await waitFor(() => expect(testEmailSettings).toHaveBeenCalledWith(expect.objectContaining({ host: 'mailpit', defaultLocale: 'en', revision: 0, recipient: 'real@example.com' })))
    expect(toast.success).toHaveBeenCalledWith('Test email queued. Final delivery depends on the recipient server.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(saveEmailSettings).not.toHaveBeenCalled()
  })

  it('shows a failure toast with the localized delivery problem', async () => {
    const testEmailSettings = vi.fn().mockRejectedValue(new ApiProblemError({ type: '/problems/mail-not-configured', title: 'mail unavailable', status: 503, code: 'mail_not_configured' }))
    const api = mockApi({
      getEmailSettings: vi.fn().mockResolvedValue({ configured: false, passwordSet: false, revision: 0 }),
      testEmailSettings,
    })
    const user = userEvent.setup()
    renderWithQueryClient(<EmailSettingsPage api={api} />)

    await screen.findByRole('heading', { name: 'System settings' })
    await user.type(screen.getByLabelText('SMTP host'), 'smtp.example.com')
    await user.type(screen.getByLabelText('From address'), 'no-reply@example.com')
    await user.type(screen.getByLabelText('From name'), 'Temvia')
    await user.click(screen.getByRole('combobox', { name: 'Default email language' }))
    await user.click(await screen.findByRole('option', { name: 'English' }))
    await user.click(screen.getByRole('button', { name: 'Send test email' }))
    const dialog = await screen.findByRole('dialog', { name: 'Send test email' })
    await user.type(within(dialog).getByLabelText('Recipient email'), 'real@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Send test email' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Test email failed.', { description: 'Email service is not configured. Contact an administrator.' }))
  })

  it('requires a valid recipient before sending a test', async () => {
    const testEmailSettings = vi.fn().mockResolvedValue(undefined)
    const api = mockApi({
      getEmailSettings: vi.fn().mockResolvedValue({ configured: false, passwordSet: false, revision: 0 }),
      testEmailSettings,
    })
    const user = userEvent.setup()
    renderWithQueryClient(<EmailSettingsPage api={api} />)

    await screen.findByRole('heading', { name: 'System settings' })
    await user.click(screen.getByRole('combobox', { name: 'Default email language' }))
    await user.click(await screen.findByRole('option', { name: 'English' }))
    await user.click(screen.getByRole('button', { name: 'Send test email' }))
    const dialog = await screen.findByRole('dialog', { name: 'Send test email' })
    await user.type(within(dialog).getByLabelText('Recipient email'), 'not-an-email')
    await user.click(within(dialog).getByRole('button', { name: 'Send test email' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter a valid email address.')
    expect(testEmailSettings).not.toHaveBeenCalled()
  })

  it('announces that email settings were saved after confirmation', async () => {
    const saveEmailSettings = vi.fn().mockResolvedValue({ configured: true, host: 'smtp.example.com', port: 587, security: 'starttls', passwordSet: false, fromAddress: 'no-reply@example.com', fromName: 'Temvia', defaultLocale: 'en', revision: 1 })
    const api = mockApi({
      getEmailSettings: vi.fn().mockResolvedValue({ configured: false, passwordSet: false, revision: 0 }),
      saveEmailSettings,
    })
    const user = userEvent.setup()
    renderWithQueryClient(<EmailSettingsPage api={api} />)

    await screen.findByRole('heading', { name: 'System settings' })
    await user.click(screen.getByRole('combobox', { name: 'Default email language' }))
    await user.click(await screen.findByRole('option', { name: 'English' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saveEmailSettings).toHaveBeenCalledOnce())
    expect(toast.success).toHaveBeenCalledWith('Email settings saved.')
  })

  it('keeps fields and mutation controls unavailable to settings readers', async () => {
    const api = mockApi({
      getEmailSettings: vi.fn().mockResolvedValue({ configured: true, host: 'smtp.example.com', port: 587, security: 'starttls', username: 'mailer', passwordSet: true, fromAddress: 'no-reply@example.com', fromName: 'Temvia', defaultLocale: 'en', revision: 3 }),
    })
    renderWithQueryClient(<EmailSettingsPage api={api} canWrite={false} />)

    const heading = await screen.findByRole('heading', { name: 'System settings' })
    expect(heading).toBeVisible()
    expect(screen.getByLabelText('SMTP host')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send test email' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Authentication' })).getByLabelText('Use SMTP authentication')).toBeDisabled()
  })

  it('keeps the draft on a conflict and requires a browser refresh', async () => {
    const saveEmailSettings = vi.fn().mockRejectedValue(new ApiProblemError({ type: '/problems/stale-revision', title: 'stale revision', status: 409, code: 'stale_revision' }))
    const getEmailSettings = vi.fn().mockResolvedValue({ configured: false, passwordSet: false, revision: 0 })
    const api = mockApi({ getEmailSettings, saveEmailSettings })
    const user = userEvent.setup()
    renderWithQueryClient(<EmailSettingsPage api={api} />)

    await screen.findByRole('heading', { name: 'System settings' })
    await user.click(screen.getByRole('combobox', { name: 'Default email language' }))
    await user.click(await screen.findByRole('option', { name: 'English' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveEmailSettings).toHaveBeenCalledOnce())
    expect(screen.getByLabelText('SMTP host')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Discard draft and reload' })).not.toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith('This record changed', { description: 'Another administrator changed this record. Refresh the page before trying again. Refreshing will discard unsaved changes.' })
  })
})
