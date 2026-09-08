import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(resolve('package.json'))
const { chromium, expect } = require('@playwright/test')
const output = resolve('../../.scratch/admin-navigation-copy/artifacts')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
let checks = 0
async function login(email, password) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:36173', viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  return { context, page }
}
async function language(page, zh) {
  await page.getByRole('button', { name: /^(Language settings|语言设置)$/ }).click()
  await page.getByRole('menuitemradio', { name: zh ? '简体中文' : 'English', exact: true }).click()
}
async function title(page, name) {
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
  checks++
}
try {
  for (const [email, password, online, history] of [
    ['online-reader@example.com', 'ReadOnly1!x', true, false],
    ['online-history-reader@example.com', 'History1!x', false, true],
    ['online-no-read@example.com', 'NoRead1!x', false, false],
  ]) {
    const { context, page } = await login(email, password)
    const nav = page.getByRole('navigation')
    await expect(nav.getByRole('button', { name: 'System monitoring', exact: true })).toHaveCount(online || history ? 1 : 0)
    await expect(nav.getByRole('link', { name: 'Online users', exact: true })).toHaveCount(online ? 1 : 0)
    await expect(nav.getByRole('link', { name: 'Operation history', exact: true })).toHaveCount(history ? 1 : 0)
    for (const [path, allowed, heading] of [['/online-users', online, 'Online users'], ['/operation-logs', history, 'Operation history']]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: allowed ? heading : 'Access denied', exact: true })).toBeVisible()
    }
    checks++
    await context.close()
  }
  const { context, page } = await login('online-super-admin@example.com', 'Target1!x')
  const routes = ['/', '/users', '/invitations', '/roles', '/online-users', '/operation-logs', '/settings']
  for (const zh of [false, true]) {
    if (zh) await language(page, true)
    const headings = zh ? ['主页', '用户管理', '邀请管理', '角色管理', '在线用户', '操作历史', '系统设置'] : ['Home', 'User management', 'Invitation management', 'Role management', 'Online users', 'Operation history', 'System settings']
    const nav = page.getByRole('navigation')
    const monitoring = nav.getByRole('button', { name: zh ? '系统监控' : 'System monitoring', exact: true })
    const group = monitoring.locator('..')
    await expect(group.getByRole('link')).toHaveText(zh ? ['在线用户', '操作历史'] : ['Online users', 'Operation history'])
    const access = nav.getByRole('button', { name: zh ? '用户与权限' : 'Users & access', exact: true }).locator('..')
    await expect(access.getByRole('link')).toHaveText(zh ? ['用户', '邀请', '角色'] : ['Users', 'Invitations', 'Roles'])
    await expect(nav.getByRole('link').last()).toHaveText(headings[6])
    for (let i = 0; i < routes.length; i++) {
      await page.goto(routes[i])
      await title(page, headings[i])
      if (i === 4 || i === 5) {
        await expect(monitoring).toHaveAttribute('aria-expanded', 'true')
        await expect(nav.getByRole('link', { name: headings[i], exact: true })).toHaveAttribute('aria-current', 'page')
      }
      if ([1, 2, 3].includes(i)) await expect(page.locator('section[aria-labelledby]').getByText((zh ? ['用户', '邀请', '角色'] : ['Users', 'Invitations', 'Roles'])[i - 1], { exact: true })).toHaveCount(0)
      if (i === 3) {
        await page.getByRole('button', { name: zh ? '创建角色' : 'Create role', exact: true }).click()
        await expect(page.getByRole('dialog').getByRole('checkbox', { name: zh ? '强制退出' : 'Force sign out', exact: true })).toBeVisible()
        await page.getByRole('dialog').getByRole('button', { name: zh ? '取消' : 'Cancel', exact: true }).click()
        checks++
      }
      if (i === 4) await expect(page.getByText(/including sessions with no recent activity|列表每 15 秒刷新/)).toHaveCount(0)
      if (i === 5) {
        await expect(page.getByText(/Review administrative actions and account activity recorded by this service|查看此服务记录的/)).toHaveCount(0)
        await expect(page.locator('datalist option[value="users.sessions.revoke"]')).toHaveText(zh ? '强制退出' : 'Force sign out')
        await page.getByLabel(zh ? '操作' : 'Action', { exact: true }).fill('users.sessions.revoke')
        await expect(page.getByRole('cell', { name: zh ? '强制退出' : 'Force sign out', exact: true }).first()).toBeVisible()
        checks++
      }
      if (zh && (i === 4 || i === 5)) await page.screenshot({ path: resolve(output, i === 4 ? 'online-desktop-zh.png' : 'history-desktop-zh.png'), fullPage: true })
    }
    await page.goto('/')
    await monitoring.focus()
    await page.keyboard.press('Enter')
    await expect(monitoring).toHaveAttribute('aria-expanded', 'false')
    await page.keyboard.press('Space')
    await expect(monitoring).toHaveAttribute('aria-expanded', 'true')
    await group.getByRole('link').first().focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/online-users$/)
    checks++
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '菜单', exact: true }).click()
  const mobileNav = page.getByRole('dialog')
  await expect(mobileNav.getByRole('button', { name: '系统监控', exact: true })).toBeVisible()
  await expect(mobileNav.getByRole('link', { name: '在线用户', exact: true })).toBeVisible()
  await expect(mobileNav.getByRole('link', { name: '操作历史', exact: true })).toBeVisible()
  await expect.poll(async () => Math.round((await mobileNav.boundingBox())?.x ?? -1)).toBe(0)
  await page.screenshot({ path: resolve(output, 'monitoring-mobile-zh.png'), fullPage: true, animations: 'disabled' })
  await mobileNav.getByRole('button', { name: '系统监控', exact: true }).focus()
  await page.keyboard.press('Escape')
  // The focused navigation button owns a tooltip, which dismisses before the sheet.
  if (await mobileNav.count()) await page.keyboard.press('Escape')
  await expect(mobileNav).toHaveCount(0)
  await title(page, '在线用户')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile page must not overflow horizontally')
  await page.screenshot({ path: resolve(output, 'online-mobile-zh.png'), fullPage: true })
  checks++
  await context.close()
  const authContext = await browser.newContext({ baseURL: 'http://127.0.0.1:36173' })
  const authPage = await authContext.newPage()
  for (const [path, heading] of [['/login', 'Sign in'], ['/forgot-password', 'Reset your password'], ['/reset-password', 'This reset link is invalid'], ['/accept-invitation', 'This invitation is invalid'], ['/setup', 'Sign in']]) {
    await authPage.goto(path)
    await title(authPage, heading)
    await expect(authPage.getByRole('heading', { level: 1 }).locator('../..').locator('p')).toHaveCount(0)
  }
  await authContext.close()
  console.log(`PASS: ${checks} real-browser navigation/title/keyboard/mobile checks; artifacts: ${output}`)
} finally {
  await browser.close()
}
