import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const setupURL = process.env.E2E_SETUP_URL
const email = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com'
const password = process.env.E2E_ADMIN_PASSWORD ?? 'Admin1!x'
const name = process.env.E2E_ADMIN_NAME ?? 'Admin User'

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return

    const sourceURL = message.location().url
    const isExpectedAuth401 = message.text().includes('401')
      && sourceURL.length > 0
      && ['/api/auth/me', '/api/auth/login'].includes(new URL(sourceURL).pathname)

    if (!isExpectedAuth401) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function expectNoA11yViolations(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations).toEqual([])
}

test.describe('administrator authentication', () => {
  test.describe.configure({ mode: 'serial' })

  test('keeps the normal login form available before setup', async ({ page }) => {
    test.skip(!setupURL, 'Set E2E_SETUP_URL to a fresh setup URL from the API log.')
    const browserErrors = collectBrowserErrors(page)
    const setupStatusRequests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/setup/status') setupStatusRequests.push(request.url())
    })

    await page.goto(new URL('/login', setupURL!).toString())
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByText(/finish initialization|open the latest setup link/i)).toHaveCount(0)
    await expectNoA11yViolations(page)

    await page.getByLabel('Email').fill('unknown@example.com')
    await page.getByLabel('Password', { exact: true }).fill('not-a-real-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toHaveText('The email or password is incorrect.')
    expect(setupStatusRequests).toEqual([])
    expect(browserErrors).toEqual([])
  })

  test('initializes, signs in, restores the session, changes locale and logs out', async ({ page }) => {
    test.skip(!setupURL, 'Set E2E_SETUP_URL to a fresh setup URL from the API log.')
    const browserErrors = collectBrowserErrors(page)
    const setupToken = new URL(setupURL!).hash.slice('#token='.length)

    await page.goto(setupURL!)
    await expect.poll(() => new URL(page.url()).hash).toBe('')
    const storage = await page.evaluate(() => `${JSON.stringify(localStorage)}${JSON.stringify(sessionStorage)}${document.cookie}`)
    expect(storage).not.toContain(setupToken)
    await expect(page.getByRole('heading', { name: /create your administrator account/i })).toBeVisible()
    await expect(page.getByRole('heading')).toHaveCount(1)
    await expect(page.locator('[data-slot="field-description"]')).toHaveCount(0)
    await expect(page.locator('main > div').getByRole('button', { name: 'Language' })).toBeVisible()
    await expectNoA11yViolations(page)
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)
    await page.getByRole('button', { name: /create administrator/i }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(page.getByRole('heading')).toHaveCount(1)
    await expect(page.locator('[data-slot="field-description"]')).toHaveCount(0)
    await expectNoA11yViolations(page)

    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
    await expect(page.getByText(new RegExp(`Welcome back, ${name}`))).toBeVisible()
    await expect(page.locator('[data-sidebar="header"]')).toHaveCount(0)

    const sidebarBox = await page.locator('[data-sidebar="sidebar"]:visible').first().boundingBox()
    const headingBox = await page.getByRole('heading', { name: 'Home' }).boundingBox()
    expect(sidebarBox).not.toBeNull()
    expect(headingBox).not.toBeNull()
    expect(headingBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width)

    await expectNoA11yViolations(page)

    await page.goto('/login')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
    await page.getByRole('button', { name: new RegExp(name) }).click()
    await page.getByRole('menuitemradio', { name: '简体中文' }).click()
    await expect(page.getByRole('heading', { name: '主页' })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '菜单' }).click()
    await expect(page.getByRole('link', { name: '主页' })).toBeVisible()
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.reload()

    await page.getByRole('button', { name: new RegExp(name) }).click()
    await page.getByRole('menuitem', { name: /退出登录|log out/i }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(browserErrors).toEqual([])
  })

  test('redirects unauthenticated visitors to login', async ({ page }) => {
    test.skip(!process.env.E2E_RUN_AUTH_SMOKE, 'Set E2E_RUN_AUTH_SMOKE=1 against a complete installation.')
    const browserErrors = collectBrowserErrors(page)
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    expect(browserErrors).toEqual([])
  })
})
