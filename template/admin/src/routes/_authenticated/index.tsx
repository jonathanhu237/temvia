import { createFileRoute, useLoaderData } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_authenticated/')({
  component: HomeRoute,
})

function HomeRoute() {
  const { t } = useTranslation('auth')
  const { user } = useLoaderData({ from: '/_authenticated' })

  return (
    <section className="flex max-w-3xl flex-col gap-5" aria-labelledby="home-title">
      <h1 id="home-title" className="text-2xl font-semibold tracking-tight">{t('homeTitle')}</h1>
      <p className="break-words text-muted-foreground">{t('welcome', { name: user.name })}</p>
    </section>
  )
}
