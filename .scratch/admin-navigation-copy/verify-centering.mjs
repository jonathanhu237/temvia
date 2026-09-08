import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const require = createRequire(resolve('package.json'))
const { chromium, expect } = require('@playwright/test')
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ baseURL: 'http://127.0.0.1:36173', viewport: { width: 1920, height: 1080 } })
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('online-super-admin@example.com')
  await page.getByLabel('Password', { exact: true }).fill('Target1!x')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/operation-logs')
  await expect(page.getByRole('heading', { name: 'Operation history', exact: true })).toBeVisible()
  for (const width of [1920, 1280, 390]) {
    await page.setViewportSize({ width, height: 1080 })
    const section = page.locator('section[aria-labelledby="operation-log-title"]')
    await expect.poll(async () => section.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const parent = el.parentElement.getBoundingClientRect()
      return Math.abs((box.left + box.right) / 2 - (parent.left + parent.right) / 2)
    })).toBeLessThan(1)
    assert(await section.evaluate(el => el.getBoundingClientRect().width <= el.parentElement.getBoundingClientRect().width))
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: resolve(`../../.scratch/admin-navigation-copy/artifacts/history-centered-${width}.png`), fullPage: true })
    console.log(`PASS: operation history centered at ${width}px without page overflow`)
  }
} finally { await browser.close() }
