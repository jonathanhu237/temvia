import { beforeEach, describe, expect, it } from 'vitest'
import { changeLocale, i18n, initializeI18n, LOCALE_STORAGE_KEY, selectInitialLocale } from './index'

describe('locale selection', () => {
  beforeEach(() => window.localStorage.clear())

  it('prefers an explicit saved locale, then browser languages, then English', () => {
    expect(selectInitialLocale('zh-CN', ['en-US'])).toBe('zh-CN')
    expect(selectInitialLocale(null, ['fr-FR', 'zh-TW'])).toBe('zh-CN')
    expect(selectInitialLocale(null, ['fr-FR'])).toBe('en')
    expect(LOCALE_STORAGE_KEY).toBe('temvia.locale')
  })

  it('persists only an explicit change and synchronizes document metadata', async () => {
    await initializeI18n()
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull()

    await changeLocale('zh-CN')
    expect(i18n.language).toBe('zh-CN')
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN')
    expect(document.documentElement).toHaveAttribute('lang', 'zh-CN')
    expect(document.documentElement).toHaveAttribute('dir', 'ltr')

    await changeLocale('en')
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(document.documentElement).toHaveAttribute('lang', 'en')
    expect(document.documentElement).toHaveAttribute('dir', 'ltr')
  })
})
