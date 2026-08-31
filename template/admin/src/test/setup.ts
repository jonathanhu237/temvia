import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { server } from './msw'

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

server.listen({ onUnhandledRequest: 'error' })
