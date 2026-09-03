import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuthPage } from './auth-page'
import { i18n, initializeI18n } from '@/shared/i18n'
import { ThemeProvider } from '@/shared/theme'

describe('authentication page shell', () => {
  beforeEach(async () => {
    await initializeI18n()
    await i18n.changeLanguage('en')
    window.localStorage.removeItem('temvia.theme')
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
  })

  it('keeps the normal auth surface to one title and a header language menu', () => {
    render(
      <AuthPage title="Create your administrator account">
        <form aria-label="Create administrator" />
      </AuthPage>,
    )

    expect(screen.getByRole('heading', { name: 'Create your administrator account' })).toBeVisible()
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Language' })).toHaveClass('max-sm:size-11', 'max-sm:shrink-0', 'max-sm:px-0')
    expect(screen.getByText('English')).toHaveClass('hidden', 'sm:inline')
    expect(screen.queryByText('Temvia')).not.toBeInTheDocument()
  })

  it('renders additional context only when the page supplies a description', () => {
    render(
      <AuthPage title="Example page" description="Additional context.">
        <p>Page content</p>
      </AuthPage>,
    )

    expect(screen.getByText('Additional context.')).toBeVisible()
    expect(screen.getByText('Page content')).toBeVisible()
  })

  it('applies a selected theme from the authentication preferences menu', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <AuthPage title="Sign in">
          <form />
        </AuthPage>
      </ThemeProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Language' }))
    await user.click(screen.getByRole('menuitem', { name: 'Appearance settings' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }))

    expect(document.documentElement).toHaveClass('dark')
    expect(window.localStorage.getItem('temvia.theme')).toBe('dark')
  })
})
