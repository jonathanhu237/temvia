import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from '@/app/providers'
import { createAppRouter } from '@/app/router'
import { createAppQueryClient } from '@/app/query-client'
import { createApiClient } from '@/shared/api/client'
import { captureSetupAuthority } from '@/shared/bootstrap/setup-authority'
import { initializeI18n } from '@/shared/i18n'
import './index.css'

async function bootstrap() {
  captureSetupAuthority()
  await initializeI18n()
  const queryClient = createAppQueryClient()
  const router = createAppRouter({ api: createApiClient(), queryClient })
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProviders queryClient={queryClient} router={router} />
    </StrictMode>,
  )
}

void bootstrap()
