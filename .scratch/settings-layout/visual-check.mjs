import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const require = createRequire(resolve('package.json'))
const { chromium, expect } = require('@playwright/test')
const browser = await chromium.launch()
try {
  for (const [locale, theme, width] of [['zh-CN', 'light', 1440], ['en', 'light', 1280], ['zh-CN', 'dark', 1440], ['zh-CN', 'light', 390], ['en', 'light', 768]]) {
    const page = await browser.newPage({ baseURL: 'http://127.0.0.1:25173', reducedMotion: locale === 'zh-CN' && theme === 'light' && width === 1440 ? 'no-preference' : 'reduce', viewport: { width, height: 800 } })
    await page.addInitScript(({locale, theme}) => { localStorage.setItem('temvia.locale', locale); localStorage.setItem('temvia.theme', theme) }, { locale, theme })
    const fixtures = {
      '/api/auth/me': { user: { id: '11111111-1111-4111-8111-111111111111', name: 'Preview Admin', email: 'preview@example.com', superAdmin: true } },
      '/api/auth/session-status': { status: 'ok' },
      '/api/operational-warnings': { warnings: [] },
      '/api/operation-logs/status': { state: 'healthy', failureCount: 0 },
      '/api/settings/email': { email: { configured: true, host: 'smtp.example.com', port: 587, security: 'starttls', passwordSet: false, fromAddress: 'notifications@example.com', fromName: 'Temvia', defaultLocale: 'zh-CN', revision: 1 } },
      '/api/settings/operation-log': { retentionDays: 180, revision: 1 },
    }
    await page.route('**/api/**', route => {
      const value = fixtures[new URL(route.request().url()).pathname]
      if (route.request().method() !== 'GET' || !value) return route.abort()
      return route.fulfill({ json: value })
    })
    await page.goto('/settings')
    await expect(page.locator('#smtp-host')).toHaveValue('smtp.example.com')
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('#smtp-username')).toHaveCount(0)
    await page.locator('#smtp-authentication').click()
    await expect(page.locator('#smtp-username')).toBeVisible()
    await page.locator('#smtp-username').fill('mailer')
    await expect(page.locator('#smtp-password')).toBeEnabled()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    if (width >= 1024) {
      const host = await page.locator('#smtp-host').boundingBox()
      const retention = await page.locator('#operation-log-retention-days').boundingBox()
      assert(Math.abs(host.x - retention.x) < 1)
    }
    const nav = page.getByRole('navigation', {name: locale === 'en' ? 'On this page' : '页内导航'})
    if (width >= 1280) {
      await expect(nav).toBeVisible()
      const links = nav.getByRole('link')
      await expect(links.first()).toHaveAttribute('aria-current', 'location')
      await links.last().click()
      await expect(links.last()).toHaveAttribute('aria-current', 'location')
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
      await expect(page.locator('#retention-settings-title')).toBeInViewport()
      await expect.poll(() => page.evaluate(() => Math.abs(window.innerHeight + window.scrollY - document.documentElement.scrollHeight))).toBeLessThan(2)
      await links.first().click()
      await expect(links.first()).toHaveAttribute('aria-current', 'location')
      await expect.poll(() => page.locator('#email-settings-title').evaluate(el => Math.abs(el.getBoundingClientRect().top - 24))).toBeLessThan(2)
      await page.evaluate(() => window.scrollTo({top: document.body.scrollHeight, behavior: 'instant'}))
      await expect(links.last()).toHaveAttribute('aria-current', 'location')
      await page.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'}))
      await expect(links.first()).toHaveAttribute('aria-current', 'location')
    } else {
      await expect(nav).toBeHidden()
    }
    await page.screenshot({path: resolve(`../../.scratch/settings-layout/artifacts/${locale}-${theme}-${width}.png`), fullPage: true})
    await page.locator('#smtp-authentication').click()
    await expect(page.locator('#smtp-username')).toHaveCount(0)
    await page.close()
    console.log(`PASS ${locale} ${theme} ${width}: layout and authentication disclosure`)
  }
} finally { await browser.close() }
