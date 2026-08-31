import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const setupUrl = readFileSync('../.preview-setup-url', 'utf8').trim()
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  locale: 'zh-CN',
  viewport: { width: 1280, height: 900 },
})
const page = await context.newPage()

await page.goto(setupUrl, { waitUntil: 'networkidle' })
await page.getByLabel('名称').fill('Admin')
await page.getByLabel('邮箱').fill('admin@example.com')
await page.getByLabel('密码', { exact: true }).fill('password')
await page.getByLabel('确认密码').fill('password')
await page.getByRole('button', { name: '创建管理员' }).click()

const expected = '请输入 8 到 128 个字符的密码，并至少包含大写字母、小写字母、数字和特殊符号。'
const error = page.locator('#password-error')
if ((await error.textContent())?.trim() !== expected) {
  throw new Error(`unexpected password message: ${await error.textContent()}`)
}
if (await page.locator('#password').getAttribute('aria-describedby') !== 'password-error') {
  throw new Error('password field is not associated with its localized error')
}
if (/invalid_(?:password|login_password)/.test(await page.locator('body').innerText())) {
  throw new Error('raw password validation code is visible')
}

await page.screenshot({
  path: 'test-results/password-policy-chinese.png',
  fullPage: true,
})
await browser.close()
