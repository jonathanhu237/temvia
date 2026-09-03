import { Globe2, Languages, SunMoon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { changeLocale } from '@/shared/i18n'
import type { Locale } from '@/shared/i18n/resources'
import { useOptionalTheme, type Theme } from '@/shared/theme'

export function PreferencesMenuItems() {
  const { t, i18n } = useTranslation('common')
  const { theme, setTheme } = useOptionalTheme()
  const locale: Locale = i18n.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
  const themeLabel = theme === 'system' ? t('system') : theme === 'light' ? t('light') : t('dark')
  const localeLabel = locale === 'zh-CN' ? t('chinese') : t('english')

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="min-h-14 gap-3 px-3 py-2">
          <SunMoon aria-hidden="true" className="text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium leading-5">{t('appearanceSettings')}</span>
            <span className="block text-xs font-normal leading-4 text-muted-foreground">{themeLabel}</span>
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
            <DropdownMenuRadioItem value="system">{t('system')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">{t('light')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">{t('dark')}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="min-h-14 gap-3 px-3 py-2">
          <Languages aria-hidden="true" className="text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium leading-5">{t('languageSettings')}</span>
            <span className="block text-xs font-normal leading-4 text-muted-foreground">{localeLabel}</span>
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={locale} onValueChange={(value) => void changeLocale(value as Locale)}>
            <DropdownMenuRadioItem value="zh-CN">{t('chinese')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="en">{t('english')}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
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
      <DropdownMenuContent align="end" className="w-64">
        <PreferencesMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
