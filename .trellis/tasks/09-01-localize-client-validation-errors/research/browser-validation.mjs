import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const setupUrl = new URL(readFileSync('../.preview-setup-url', 'utf8').trim())
setupUrl.protocol = 'http:'
setupUrl.hostname = '127.0.0.1'
setupUrl.port = '41173'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  locale: 'zh-CN',
  viewport: { width: 1280, height: 900 },
})
const page = await context.newPage()

await page.goto(setupUrl.toString(), { waitUntil: 'networkidle' })
await page.getByLabel('名称').fill('')
await page.getByLabel('邮箱').fill('x')
await page.getByLabel('密码', { exact: true }).fill('short')
await page.getByLabel('确认密码').fill('different')
await page.getByRole('button', { name: '创建管理员' }).click()

const expected = {
  name: '请输入 1 到 100 个字符的名称，且不能包含控制字符。',
  email: '请输入有效的邮箱地址。',
  password: '请输入 15 到 128 个字符的密码。',
  passwordConfirmation: '两次输入的密码不一致。',
}

for (const [id, message] of Object.entries(expected)) {
  const input = page.locator(`#${id}`)
  const describedBy = await input.getAttribute('aria-describedby')
  if (describedBy !== `${id}-error`) {
    throw new Error(`${id} has incorrect aria-describedby: ${describedBy}`)
  }
  const rendered = (await page.locator(`#${describedBy}`).textContent())?.trim()
  if (rendered !== message) {
    throw new Error(`${id} rendered unexpected message: ${rendered}`)
  }
}

const text = await page.locator('body').innerText()
if (/invalid_(?:name|email|password)|password_mismatch/.test(text)) {
  throw new Error('raw validation code is visible')
}

await page.screenshot({
  path: 'test-results/client-validation-chinese.png',
  fullPage: true,
})
await browser.close()
