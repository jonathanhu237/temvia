import { Globe2, Layers3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { changeLocale } from '@/shared/i18n'
import type { Locale } from '@/shared/i18n/resources'

export function LanguageMenu({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation('common')
  const locale: Locale = i18n.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={compact ? 'icon' : 'sm'} aria-label={t('language')}>
          <Globe2 aria-hidden="true" data-icon="inline-start" />
          {!compact && <span>{locale === 'zh-CN' ? t('chinese') : t('english')}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('language')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={(value) => void changeLocale(value as Locale)}>
          <DropdownMenuRadioItem value="zh-CN">{t('chinese')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">{t('english')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AuthPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
}) {
  const { t } = useTranslation('common')
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10 sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-primary" />
      <div className="relative flex w-full max-w-md flex-col gap-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm font-semibold tracking-tight text-foreground">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Layers3 aria-hidden="true" />
            </span>
            <span>{t('productName')}</span>
          </div>
          <LanguageMenu />
        </header>
        <Card className="border-border/80 shadow-lg shadow-foreground/5">
          <CardHeader className="gap-3 pb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
            <h1 className="text-2xl font-semibold leading-none tracking-tight sm:text-3xl">{title}</h1>
            <CardDescription className="max-w-[38ch] text-base leading-relaxed">{description}</CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="pt-6">{children}</CardContent>
        </Card>
      </div>
    </main>
  )
}

export function AuthAlert({ title, description }: { title: string; description: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  )
}

export function RecoveryState({ title, description, instruction }: { title: string; description: string; instruction?: string }) {
  const { t } = useTranslation('common')
  return (
    <div className="flex flex-col gap-5">
      <AuthAlert title={title} description={description} />
      {instruction && <p className="text-sm leading-relaxed text-muted-foreground">{instruction}</p>}
      <Button asChild variant="outline" className="w-full">
        <a href="/login">{t('backToLogin')}</a>
      </Button>
    </div>
  )
}
