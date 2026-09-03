import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { Toaster } from '@/components/ui/sonner'
import type { QueryClient } from '@tanstack/react-query'
import type { AppRouter } from './router'
import { ThemeProvider, useTheme } from '@/shared/theme'

function ThemeToaster() {
  const { resolvedTheme } = useTheme()
  return <Toaster theme={resolvedTheme} />
}

export function AppProviders({ queryClient, router }: { queryClient: QueryClient; router: AppRouter }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeToaster />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
