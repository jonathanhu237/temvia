import { createFileRoute, useLoaderData } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_authenticated/')({
  component: HomeRoute,
})

function HomeRoute() {
  const { t } = useTranslation('auth')
  const { user } = useLoaderData({ from: '/_authenticated' })
  return (
    <section className="flex max-w-3xl flex-col gap-3">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('homeTitle')}</p>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t('homeTitle')}</h1>
      <p className="max-w-[60ch] text-base leading-relaxed text-muted-foreground">{t('welcome', { name: user.name })}</p>
    </section>
  )
}
