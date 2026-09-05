import { render, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRequestErrorToast } from './feedback'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function ErrorObserver({ error }: { error: unknown }) {
  useRequestErrorToast(error, true, () => '', { title: 'Request failed', description: 'Refresh the page.' })
  return null
}

describe('request feedback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('announces the same failed request once across observers', async () => {
    const error = new Error('network')
    render(<><ErrorObserver error={error} /><ErrorObserver error={error} /></>)

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Request failed', { description: 'Refresh the page.' }))
    expect(toast.error).toHaveBeenCalledOnce()
  })
})
