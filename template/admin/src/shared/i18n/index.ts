import i18next, { type i18n as I18nInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resources, type Locale } from './resources'

export const LOCALE_STORAGE_KEY = 'temvia.locale'
export const supportedLocales: readonly Locale[] = ['zh-CN', 'en']

function asLocale(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined
  const normalized = value.toLowerCase()
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN'
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en'
  return undefined
}

export function selectInitialLocale(
  stored: string | null | undefined,
  languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages,
): Locale {
  return asLocale(stored) ?? languages.map(asLocale).find((locale): locale is Locale => locale !== undefined) ?? 'en'
}

function syncDocumentLanguage(locale: Locale): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.dir = 'ltr'
}

export const i18n = i18next.createInstance()

export async function initializeI18n(): Promise<I18nInstance> {
  const stored = (() => {
    try {
      return window.localStorage.getItem(LOCALE_STORAGE_KEY)
    } catch {
      return null
    }
  })()
  const locale = selectInitialLocale(stored)
  await i18n.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  })
  syncDocumentLanguage(locale)
  return i18n
}

export async function changeLocale(locale: Locale): Promise<void> {
  await i18n.changeLanguage(locale)
  syncDocumentLanguage(locale)
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // A blocked storage implementation should not prevent a language change.
  }
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: typeof resources.en
  }
}
