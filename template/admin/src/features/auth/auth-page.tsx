import { Globe2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { changeLocale } from '@/shared/i18n'
import type { Locale } from '@/shared/i18n/resources'

export function LanguageMenu() {
  const { t, i18n } = useTranslation('common')
  const locale: Locale = i18n.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-sm:size-11 max-sm:shrink-0 max-sm:px-0" aria-label={t('language')}>
          <Globe2 aria-hidden="true" data-icon="inline-start" />
          <span className="hidden sm:inline">{locale === 'zh-CN' ? t('chinese') : t('english')}</span>
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
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10 sm:px-6">
      <Card className="w-full max-w-md">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle>
              <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{title}</h1>
            </CardTitle>
            {description && <CardDescription className="mt-3 max-w-[38ch] text-base leading-relaxed">{description}</CardDescription>}
          </div>
          <LanguageMenu />
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
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
