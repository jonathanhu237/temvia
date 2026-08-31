import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuthPage } from './auth-page'
import { i18n, initializeI18n } from '@/shared/i18n'

describe('authentication page shell', () => {
  beforeEach(async () => {
    await initializeI18n()
    await i18n.changeLanguage('en')
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

  it('renders recovery context only when the page supplies a description', () => {
    render(
      <AuthPage title="Open a fresh setup link" description="The latest setup link is required.">
        <p>Recovery content</p>
      </AuthPage>,
    )

    expect(screen.getByText('The latest setup link is required.')).toBeVisible()
    expect(screen.getByText('Recovery content')).toBeVisible()
  })
})
