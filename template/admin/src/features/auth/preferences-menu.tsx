import { Globe2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { changeLocale } from '@/shared/i18n'
import type { Locale } from '@/shared/i18n/resources'
import { useOptionalTheme, type Theme } from '@/shared/theme'

export function PreferencesMenuItems() {
  const { t, i18n } = useTranslation('common')
  const { theme, setTheme } = useOptionalTheme()
  const locale: Locale = i18n.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{t('appearance')}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
        <DropdownMenuRadioItem value="system">{t('system')}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="light">{t('light')}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">{t('dark')}</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{t('language')}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={locale} onValueChange={(value) => void changeLocale(value as Locale)}>
        <DropdownMenuRadioItem value="zh-CN">{t('chinese')}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="en">{t('english')}</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  )
}

export function PreferencesMenu() {
  const { t, i18n } = useTranslation('common')
  const locale: Locale = i18n.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="max-sm:size-11 max-sm:shrink-0 max-sm:px-0"
          aria-label={t('language')}
        >
          <Globe2 aria-hidden="true" data-icon="inline-start" />
          <span className="hidden sm:inline">{locale === 'zh-CN' ? t('chinese') : t('english')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <PreferencesMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
