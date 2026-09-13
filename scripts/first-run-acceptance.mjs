import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const totalTimeout = 20 * 60_000
const commandTimeout = 15 * 60_000
const cleanupTimeout = 2 * 60_000
const pollInterval = 500

const acceptanceRoutingPrefixes = ['COMPOSE_', 'E2E_', 'PLAYWRIGHT_', 'POSTGRES_', 'PG']
const acceptanceSecretNames = new Set([
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'NPM_TOKEN',
  'NODE_AUTH_TOKEN',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AZURE_CLIENT_SECRET',
])

const acceptanceRoutingNames = new Set([
  'APP_PUBLIC_URL',
  'APP_ENV',
  'API_PORT',
  'ADMIN_PORT',
  'MAILPIT_UI_PORT',
  'HTTP_ADDR',
  'TRUSTED_PROXY_CIDRS',
  'SETUP_LINK_TTL',
  'PASSWORD_RESET_LINK_TTL',
  'INVITATION_LINK_TTL',
  'EMAIL_SETTINGS_ENCRYPTION_KEY',
  'PASSWORD_RESET_TOKEN_KEY',
  'INVITATION_TOKEN_KEY',
  'SHUTDOWN_TIMEOUT',
  // Do not let Docker or npm configuration change where the acceptance runs,
  // where the release is installed, or which registry is consulted. Keep npm's
  // proxy variables untouched so a restricted runner can still fetch generated
  // admin dependencies.
  'NPM_CONFIG_PREFIX',
  'npm_config_prefix',
  'NPM_CONFIG_GLOBAL',
  'npm_config_global',
  'NPM_CONFIG_USERCONFIG',
  'npm_config_userconfig',
  'NPM_CONFIG_REGISTRY',
  'npm_config_registry',
  'NPM_CONFIG__AUTH',
  'npm_config__auth',
  'NPM_CONFIG_AUTH_TOKEN',
  'npm_config_authToken',
  'NPM_CONFIG_ALWAYS_AUTH',
  'npm_config_always_auth',
  'NPM_CONFIG_CACHE',
  'npm_config_cache',
  'NPM_CONFIG_TMP',
  'npm_config_tmp',
  'NPM_CONFIG_OFFLINE',
  'npm_config_offline',
  'NPM_CONFIG_FROZEN_LOCKFILE',
  'npm_config_frozen_lockfile',
  'PNPM_HOME',
  'TEST_POSTGRES_DSN',
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_CONFIG',
  'DOCKER_AUTH_CONFIG',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_CONFIG',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_TEMPLATE_DIR',
  'MAKEFLAGS',
  'MFLAGS',
  'MAKEFILES',
  'NODE_OPTIONS',
  'NODE_PATH',
])

function isAcceptanceRoutingEnvironmentName(name) {
  return acceptanceRoutingNames.has(name) || acceptanceRoutingPrefixes.some((prefix) => name.startsWith(prefix))
}

/**
 * Keep process tooling and network proxy settings, but do not let inherited
 * deployment variables choose the project, database, browser origin, or
 * first-run credentials. Compose-specific interpolation names are removed
 * again by createAcceptanceEnvironment after reading the generated file.
 */
export function sanitizeAcceptanceEnvironment(sourceEnvironment = process.env) {
  return Object.fromEntries(Object.entries(sourceEnvironment).filter(([name]) => (
    !isAcceptanceRoutingEnvironmentName(name) && !acceptanceSecretNames.has(name)
  )))
}

/**
 * Make every Compose command consume the generated project's exact files.
 * Compose gives shell variables precedence over .env, so deleting every
 * application-routing interpolation name from the inherited environment is
 * part of the isolation guarantee, not just a convenience for the test runner.
 */
export async function createAcceptanceEnvironment(projectDirectory, projectName, sourceEnvironment = process.env) {
  const composePath = join(projectDirectory, 'compose.yaml')
  const composeSource = await readFile(composePath, 'utf8')
  const interpolationNames = new Set([...composeSource.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]))
  const environment = sanitizeAcceptanceEnvironment(sourceEnvironment)
  for (const name of interpolationNames) {
    // GOPROXY is a dependency-fetch proxy rather than application routing. A
    // restricted network runner may need the caller's value for `make build`,
    // while every deployment setting below is intentionally supplied only by
    // the generated .env file.
    if (name !== 'GOPROXY') delete environment[name]
  }
  environment.COMPOSE_FILE = composePath
  environment.COMPOSE_ENV_FILES = join(projectDirectory, '.env')
  environment.COMPOSE_PROJECT_NAME = projectName
  return environment
}

export function createBrowserEnvironment(composeEnvironment, {
  setupURL,
  origin,
  email,
  password,
  name,
  extraEnvironment = {},
}) {
  const environment = sanitizeAcceptanceEnvironment(composeEnvironment)
  const additional = Object.fromEntries(Object.entries(extraEnvironment ?? {}).filter(([name]) => (
    name.startsWith('E2E_') || name === 'PLAYWRIGHT_BROWSERS_PATH' || !isAcceptanceRoutingEnvironmentName(name)
  )))
  return {
    ...environment,
    ...additional,
    CI: 'true',
    E2E_FIRST_RUN: '1',
    E2E_SETUP_URL: setupURL,
    E2E_ADMIN_EMAIL: email,
    E2E_ADMIN_PASSWORD: password,
    E2E_ADMIN_NAME: name,
    PLAYWRIGHT_BASE_URL: origin,
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function redact(value, secrets = []) {
  let result = String(value ?? '')
  // Setup authorities and reset/session credentials must never appear in CI
  // diagnostics, even when a child process includes an API log in its error.
  for (const secret of secrets) {
    if (secret) result = result.replace(new RegExp(escapeRegExp(secret), 'g'), '[REDACTED]')
  }
  result = result.replace(/https?:\/\/[^\s<>"']+/g, '[REDACTED-URL]')
  result = result.replace(/\bv1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, '[REDACTED-TOKEN]')
  result = result.replace(/(#token=)[A-Za-z0-9_-]+/g, '$1[REDACTED]')
  result = result.replace(/((?:code|otp|验证码|驗證碼)[^\d\n]{0,40})\d{4,8}/gi, '$1[REDACTED-CODE]')
  // Test failures may echo a response or mail fixture. Keep the command and
  // assertion context useful without copying message bodies into CI logs.
  result = result.replace(/((?:body|content|text|html|message)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|<[^>]*>)/gi, '$1[REDACTED-CONTENT]')
  return result
}

function truncate(value, limit = 6_000) {
  const text = String(value ?? '')
  return text.length <= limit ? text : `${text.slice(-limit)}\n[…diagnostics truncated…]`
}

export function remaining(deadline) {
  const value = deadline - Date.now()
  if (value <= 0) throw new Error('acceptance run exceeded its total timeout')
  return value
}

export async function runCommand(command, args, options = {}) {
  const { cwd, env, timeout = commandTimeout, secrets = [], label = `${command} ${args.join(' ')}`, includeOutput = true } = options
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      env,
      encoding: 'utf8',
      timeout,
      maxBuffer: 50 * 1024 * 1024,
      windowsHide: true,
    })
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
  } catch (error) {
    const stdout = error?.stdout ?? ''
    const stderr = error?.stderr ?? ''
    const details = includeOutput
      ? [stdout, stderr].filter(Boolean).map((value) => truncate(redact(value, secrets))).join('\n')
      : ''
    const timedOut = error?.code === 'ETIMEDOUT' || (error?.signal === 'SIGTERM' && error?.killed)
    const unavailable = error?.code === 'ENOENT'
    const reason = timedOut
      ? ' timed out'
      : unavailable
        ? ' (required command is unavailable)'
        : error?.signal
          ? ` (${error.signal})`
          : error?.code
            ? ` (exit ${error.code})`
            : ''
    throw new Error(`${label}${reason} failed${details ? `:\n${details}` : ''}`, { cause: error })
  }
}

/**
 * Run the exact Playwright version installed by the generated admin project.
 * Calling pnpm exec here can make pnpm reconcile dependencies again; under a
 * CI environment that can attempt an ignored build and fail before Playwright
 * starts. Directly invoking the pinned local CLI keeps browser installation and
 * test execution separate from package-manager lifecycle behavior.
 */
export function playwrightCLIInvocation(adminDirectory, cliArguments = []) {
  if (!Array.isArray(cliArguments) || cliArguments.some((argument) => typeof argument !== 'string')) {
    throw new TypeError('Playwright CLI arguments must be an array of strings')
  }
  return {
    command: process.execPath,
    args: [join(adminDirectory, 'node_modules', '@playwright', 'test', 'cli.js'), ...cliArguments],
  }
}

function isPathWithin(root, candidate) {
  const child = relative(root, candidate)
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

function assertOwnedDirectory(info, path, label) {
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} is not an owned directory: ${path}`)
  if (typeof process.getuid === 'function' && typeof info.uid === 'number' && info.uid !== process.getuid()) {
    throw new Error(`${label} is not owned by the acceptance process: ${path}`)
  }
}

/**
 * Go deliberately makes extracted module-cache directories read-only. Only
 * make directories inside the runner-created cache writable before removing
 * the temporary root; never chmod files, follow symlinks, or touch a global
 * Go cache. The component walk also rejects a symlink in the cache path so a
 * changed cache cannot redirect this cleanup outside the owned root.
 */
export async function prepareOwnedGoModuleCacheForCleanup(temporaryRoot, moduleCache) {
  const root = resolve(temporaryRoot)
  const cache = resolve(moduleCache)
  if (!isPathWithin(root, cache)) throw new Error(`refusing to clean a Go module cache outside the acceptance root: ${cache}`)

  let rootInfo
  try {
    rootInfo = await lstat(root)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  assertOwnedDirectory(rootInfo, root, 'acceptance cleanup root')

  let current = root
  const components = relative(root, cache).split(sep).filter(Boolean)
  for (const component of components) {
    current = join(current, component)
    let info
    try {
      info = await lstat(current)
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
    if (info.isSymbolicLink()) throw new Error(`refusing to clean a symlinked Go module cache path: ${current}`)
    assertOwnedDirectory(info, current, 'Go module cache path')
  }

  async function makeDirectoriesWritable(directory) {
    const info = await lstat(directory)
    if (info.isSymbolicLink()) return
    assertOwnedDirectory(info, directory, 'Go module cache directory')
    // Directory write/execute permission is sufficient to unlink read-only
    // module files. Avoid chmod on files, which could affect a hard-linked
    // resource outside this isolated cache.
    await chmod(directory, (info.mode & 0o7777) | 0o700)
    for (const entry of await readdir(directory)) {
      const child = join(directory, entry)
      const childInfo = await lstat(child)
      if (childInfo.isDirectory() && !childInfo.isSymbolicLink()) await makeDirectoriesWritable(child)
    }
  }

  await makeDirectoriesWritable(cache)
}

export async function cleanupAcceptanceTemporaryDirectory(temporaryRoot, moduleCache, label = 'Acceptance') {
  const failures = []
  try {
    await prepareOwnedGoModuleCacheForCleanup(temporaryRoot, moduleCache)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(new Error(`${label} Go module-cache cleanup failed: ${message}`, { cause: error }))
  }
  try {
    await rm(temporaryRoot, { recursive: true, force: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(new Error(`${label} temporary-directory cleanup failed: ${message}`, { cause: error }))
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, `${label} cleanup failed`)
}

function parseJSONReport(output, label) {
  const text = String(output ?? '').trim()
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {
        // Fall through to the diagnostic below.
      }
    }
    throw new Error(`${label} did not produce a valid JSON report`)
  }
}

function collectPlaywrightTests(suites, tests = []) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) tests.push({ title: spec.title, test })
    }
    collectPlaywrightTests(suite.suites, tests)
  }
  return tests
}

export function assertPlaywrightReport(output, expectedTitles, label = 'Playwright acceptance') {
  const report = typeof output === 'string' ? parseJSONReport(output, label) : output
  if (Array.isArray(report?.errors) && report.errors.length > 0) throw new Error(`${label} reported ${report.errors.length} runner error(s)`)
  const tests = collectPlaywrightTests(report?.suites)
  const expected = new Set(expectedTitles)
  const actual = new Set(tests.map(({ title }) => title))
  const missing = [...expected].filter((title) => !actual.has(title))
  const unexpected = [...actual].filter((title) => !expected.has(title))
  if (missing.length || unexpected.length || tests.length === 0 || tests.length !== expected.size) {
    throw new Error(`${label} selected ${tests.length} test(s); missing=${missing.join(',') || 'none'} unexpected=${unexpected.join(',') || 'none'}`)
  }
  const skipped = []
  const failed = []
  for (const { title, test } of tests) {
    const statuses = (test.results ?? []).map((result) => result.status).filter(Boolean)
    const status = test.status ?? statuses.at(-1)
    if (status === 'skipped' || status === 'interrupted' || statuses.includes('skipped')) skipped.push(title)
    else if (status !== 'expected' || !statuses.includes('passed')) failed.push(`${title} (${status ?? 'unknown'})`)
  }
  if (skipped.length) throw new Error(`${label} skipped mandatory test(s): ${skipped.join(', ')}`)
  if (failed.length) throw new Error(`${label} did not pass mandatory test(s): ${failed.join(', ')}`)
  if (actual.size !== expected.size) throw new Error(`${label} test selection was not exact`)
  return { total: tests.length, passed: tests.length, skipped: 0 }
}

async function tryCommand(command, args, options = {}) {
  try {
    return await runCommand(command, args, options)
  } catch {
    return undefined
  }
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('could not allocate an isolated port')))
        return
      }
      server.close((error) => error ? reject(error) : resolvePort(address.port))
    })
  })
}

async function waitFor(label, probe, deadline) {
  let lastError = 'not ready'
  while (Date.now() < deadline) {
    try {
      if (await probe()) return
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, pollInterval))
  }
  throw new Error(`${label} was not ready before the acceptance timeout (${lastError})`)
}

async function waitForHTTP(url, deadline) {
  await waitFor(url, async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.min(3_000, Math.max(1, deadline - Date.now())))
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
      return response.ok
    } finally {
      clearTimeout(timer)
    }
  }, deadline)
}

function composeCommand(projectName, projectDirectory, env, args, deadline, options = {}) {
  return runCommand('docker', ['compose', '--project-name', projectName, ...args], {
    cwd: projectDirectory,
    env,
    timeout: Math.min(options.timeout ?? commandTimeout, remaining(deadline)),
    secrets: options.secrets,
    label: options.label ?? `docker compose ${args.join(' ')}`,
  })
}

async function migrationInventory(projectDirectory, projectName, env, deadline, secrets) {
  const migrationDirectory = join(projectDirectory, 'api', 'migrations')
  const expected = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort()
  const result = await composeCommand(projectName, projectDirectory, env, [
    '--profile', 'tools', 'run', '--rm', '--no-deps', '--entrypoint', 'sh', 'migrate', '-c',
    'for path in /migrations/*.sql; do basename "$path"; done',
  ], deadline, { secrets, label: 'inspect the migration image' })
  const actual = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.endsWith('.sql')).sort()
  if (expected.length !== actual.length || expected.some((name, index) => name !== actual[index])) {
    throw new Error(`migration image inventory differs from the generated source (expected ${expected.length} SQL files, found ${actual.length})`)
  }
  if (!expected.some((name) => name.endsWith('.up.sql')) || !expected.some((name) => name.endsWith('.down.sql'))) {
    throw new Error('generated migrations do not contain both forward and reverse SQL files')
  }
}

function setupLinkFromLogs(logs, origin) {
  const match = logs.match(/(https?:\/\/[^\s]+\/setup#token=([A-Za-z0-9_-]{43}))/)
  if (!match) return undefined
  const link = match[1].replace(/[),.;]+$/, '')
  const parsed = new URL(link)
  if (parsed.origin !== origin || parsed.pathname !== '/setup' || parsed.hash !== `#token=${match[2]}`) {
    throw new Error('the API setup link did not use the configured browser origin')
  }
  return link
}

async function readSetupLink(compose, origin, deadline, secrets) {
  let lastLogs = ''
  let setupURL
  await waitFor('API setup link', async () => {
    const result = await tryCommand('docker', ['compose', '--project-name', compose.projectName, 'logs', '--no-color', '--tail', '200', 'api'], {
      cwd: compose.projectDirectory,
      env: compose.env,
      timeout: Math.min(15_000, Math.max(1, deadline - Date.now())),
      secrets,
      label: 'read API logs',
    })
    lastLogs = result ? `${result.stdout}\n${result.stderr}` : lastLogs
    setupURL = setupLinkFromLogs(lastLogs, origin)
    return Boolean(setupURL)
  }, deadline)
  if (!setupURL) throw new Error('API logs did not contain a setup link')
  return setupURL
}

export async function runFirstRunAcceptance(tarballPath, options = {}) {
  const tarball = resolve(tarballPath)
  const requestedTimeout = options.totalTimeout ?? totalTimeout
  if (!Number.isFinite(requestedTimeout) || requestedTimeout <= 0) throw new Error('acceptance total timeout must be a positive finite duration')
  const deadline = Date.now() + requestedTimeout
  const adminCredentials = options.adminCredentials ?? {
    email: 'acceptance-admin@example.com',
    password: 'Admin1!x',
    name: 'Acceptance Admin',
  }
  if (!adminCredentials || typeof adminCredentials !== 'object') throw new Error('acceptance administrator credentials are required')
  for (const [field, value] of Object.entries(adminCredentials)) {
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`acceptance administrator ${field} is required`)
  }
  const temporary = await mkdtemp(join(tmpdir(), 'temvia-first-run-'))
  const toolEnvironment = {
    ...sanitizeAcceptanceEnvironment(),
    HOME: join(temporary, 'home'),
    DOCKER_CONFIG: join(temporary, 'docker-config'),
    XDG_CONFIG_HOME: join(temporary, 'xdg-config'),
    XDG_CACHE_HOME: join(temporary, 'xdg-cache'),
    XDG_DATA_HOME: join(temporary, 'xdg-data'),
    XDG_STATE_HOME: join(temporary, 'xdg-state'),
    GOPATH: join(temporary, 'go-path'),
    GOMODCACHE: join(temporary, 'go-module-cache'),
    GOCACHE: join(temporary, 'go-cache'),
    NPM_CONFIG_CACHE: join(temporary, 'npm-cache'),
    NPM_CONFIG_TMP: join(temporary, 'npm-tmp'),
    PNPM_HOME: join(temporary, 'pnpm-home'),
  }
  const consumer = join(temporary, 'consumer')
  const projectDirectory = join(temporary, 'generated-project')
  const acceptanceLabel = options.acceptanceLabel ?? 'First-run acceptance'
  const secrets = Object.values(adminCredentials).filter((value) => typeof value === 'string' && value.length > 0)
  let projectName
  let compose
  let primaryError
  let cleanupError
  let acceptanceContext
  const cleanupTemporaryDirectory = options.cleanupTemporaryDirectory ?? cleanupAcceptanceTemporaryDirectory
  try {
    await Promise.all([
      mkdir(toolEnvironment.HOME),
      mkdir(toolEnvironment.DOCKER_CONFIG),
      mkdir(toolEnvironment.XDG_CONFIG_HOME),
      mkdir(toolEnvironment.XDG_CACHE_HOME),
      mkdir(toolEnvironment.XDG_DATA_HOME),
      mkdir(toolEnvironment.XDG_STATE_HOME),
    ])
    await stat(tarball)
    await mkdir(consumer)
    await writeFile(join(consumer, 'package.json'), '{"private":true}\n')

    await runCommand('npm', [
      'install', '--offline', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund',
      '--package-lock=false', tarball,
    ], { cwd: consumer, env: toolEnvironment, timeout: Math.min(commandTimeout, remaining(deadline)), label: 'install the release tarball' })

    const cli = join(consumer, 'node_modules', '.bin', 'create-temvia')
    await runCommand(cli, [projectDirectory, '--module', 'github.com/temvia/first-run-acceptance/api'], {
      cwd: consumer,
      env: toolEnvironment,
      timeout: Math.min(commandTimeout, remaining(deadline)),
      label: 'generate the acceptance project from the release tarball',
    })

    const [apiPort, adminPort, postgresPort, mailpitPort] = await Promise.all([freePort(), freePort(), freePort(), freePort()])
    const postgresPassword = options.postgresPassword ?? randomBytes(24).toString('base64url')
    const passwordResetKey = randomBytes(32).toString('base64url')
    const invitationKey = randomBytes(32).toString('base64url')
    const emailEncryptionKey = randomBytes(32).toString('base64url')
    secrets.push(postgresPassword, passwordResetKey, invitationKey, emailEncryptionKey)
    const origin = `http://127.0.0.1:${adminPort}`
    await writeFile(join(projectDirectory, '.env'), [
      'APP_ENV=development',
      `APP_PUBLIC_URL=${origin}`,
      `API_PORT=${apiPort}`,
      `ADMIN_PORT=${adminPort}`,
      `POSTGRES_HOST_PORT=${postgresPort}`,
      `MAILPIT_UI_PORT=${mailpitPort}`,
      'POSTGRES_DB=temvia',
      'POSTGRES_USER=temvia',
      `POSTGRES_PASSWORD=${postgresPassword}`,
      `PASSWORD_RESET_TOKEN_KEY=${passwordResetKey}`,
      `INVITATION_TOKEN_KEY=${invitationKey}`,
      `EMAIL_SETTINGS_ENCRYPTION_KEY=${emailEncryptionKey}`,
      'SETUP_LINK_TTL=10m',
      'SHUTDOWN_TIMEOUT=10s',
      'PASSWORD_HASH_MAX_CONCURRENCY=1',
      '',
    ].join('\n'), { mode: 0o600 })

    projectName = `temvia-readiness-${process.pid}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
    compose = {
      projectName,
      projectDirectory,
      env: await createAcceptanceEnvironment(projectDirectory, projectName, toolEnvironment),
    }
    const adminDirectory = join(projectDirectory, 'admin')
    acceptanceContext = {
      tarball,
      deadline,
      temporary,
      consumer,
      projectDirectory,
      adminDirectory,
      compose,
      ports: { api: apiPort, admin: adminPort, postgres: postgresPort, mailpit: mailpitPort },
      postgresPassword,
      origin,
      adminCredentials,
      secrets,
      toolEnvironment,
      successMessages: [],
    }
    // Exercise the same documented targets a generated user follows. The
    // project-specific COMPOSE_PROJECT_NAME and ports keep every resource
    // isolated from services on the runner.
    await runCommand('make', ['build'], {
      cwd: projectDirectory,
      env: compose.env,
      timeout: Math.min(commandTimeout, remaining(deadline)),
      secrets,
      label: 'build the generated Compose images',
    })
    await migrationInventory(projectDirectory, projectName, compose.env, deadline, secrets)
    await runCommand('make', ['migrate-up'], {
      cwd: projectDirectory,
      env: compose.env,
      timeout: Math.min(commandTimeout, remaining(deadline)),
      secrets,
      label: 'run all database migrations',
    })
    if (options.beforeServices) await options.beforeServices(acceptanceContext)
    await runCommand('make', ['up'], {
      cwd: projectDirectory,
      env: compose.env,
      timeout: Math.min(commandTimeout, remaining(deadline)),
      secrets,
      label: 'start the generated API and admin',
    })
    await waitForHTTP(`http://127.0.0.1:${apiPort}/health`, Math.min(deadline, Date.now() + 120_000))
    await waitForHTTP(origin, Math.min(deadline, Date.now() + 120_000))
    if (options.requireMailpit) {
      await waitForHTTP(`http://127.0.0.1:${mailpitPort}/api/v1/messages?limit=1`, Math.min(deadline, Date.now() + 120_000))
    }
    const setupURL = await readSetupLink(compose, origin, deadline, secrets)
    const setupToken = new URL(setupURL).hash.slice('#token='.length)
    secrets.push(setupToken)

    acceptanceContext.setupURL = setupURL
    acceptanceContext.setupToken = setupToken
    if (options.beforeBrowser) await options.beforeBrowser(acceptanceContext)
    await runCommand('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], {
      cwd: adminDirectory,
      env: toolEnvironment,
      timeout: Math.min(commandTimeout, remaining(deadline)),
      secrets,
      includeOutput: true,
      label: 'install the generated admin test dependencies',
    })
    const configuredBrowserEnvironment = typeof options.browserEnvironment === 'function'
      ? options.browserEnvironment(acceptanceContext)
      : options.browserEnvironment
    const extraBrowserEnvironment = {
      ...configuredBrowserEnvironment,
      PLAYWRIGHT_BROWSERS_PATH: join(temporary, 'playwright-browsers'),
    }
    const browserEnv = createBrowserEnvironment(compose.env, {
      setupURL,
      origin,
      email: adminCredentials.email,
      password: adminCredentials.password,
      name: adminCredentials.name,
      extraEnvironment: extraBrowserEnvironment,
    })
    acceptanceContext.browserEnv = browserEnv
    const browserInstall = playwrightCLIInvocation(adminDirectory, ['install', 'chromium'])
    await runCommand(browserInstall.command, browserInstall.args, {
      cwd: adminDirectory,
      env: browserEnv,
      timeout: Math.min(commandTimeout, remaining(deadline)),
      secrets,
      // Browser test JSON can contain credentials and mail payloads, but a
      // failed browser download needs its redacted non-secret diagnostics.
      includeOutput: true,
      label: 'install the Playwright browser for the acceptance gate',
    })
    const firstRun = playwrightCLIInvocation(adminDirectory, ['test', 'e2e/first-run.spec.ts', '--workers=1', '--reporter=json'])
    const firstRunOutput = await runCommand(firstRun.command, firstRun.args, {
      cwd: adminDirectory,
      env: browserEnv,
      timeout: Math.min(commandTimeout, remaining(deadline)),
      secrets,
      includeOutput: false,
      label: 'run the browser first-run setup and login gate (creates the first administrator and explicitly signs in)',
    })
    const firstRunResult = assertPlaywrightReport(firstRunOutput.stdout, ['creates the first administrator and explicitly signs in'], 'first-run browser acceptance')
    acceptanceContext.firstRunResult = firstRunResult
    if (options.afterFirstRun) await options.afterFirstRun(acceptanceContext)
  } catch (error) {
    primaryError = error
  } finally {
    const cleanupFailures = []
    if (primaryError && compose) {
      const logs = await tryCommand('docker', ['compose', '--project-name', projectName, 'logs', '--no-color', '--tail', '200'], {
        cwd: projectDirectory,
        env: compose.env,
        timeout: cleanupTimeout,
        secrets,
        label: 'collect Compose diagnostics',
      })
      if (logs) console.error(truncate(redact(`${logs.stdout}\n${logs.stderr}`, secrets)))
    }
    if (compose) {
      try {
        await runCommand('docker', ['compose', '--project-name', projectName, 'down', '--volumes', '--remove-orphans', '--rmi', 'local'], {
          cwd: projectDirectory,
          env: compose.env,
          timeout: cleanupTimeout,
          secrets,
          label: 'clean up the isolated Compose project',
        })
      } catch (error) {
        cleanupFailures.push(error)
        console.error(`${acceptanceLabel} cleanup failed: ${redact(error instanceof Error ? error.message : String(error), secrets)}`)
      }
    }
    try {
      await cleanupTemporaryDirectory(temporary, toolEnvironment.GOMODCACHE, acceptanceLabel)
    } catch (error) {
      cleanupFailures.push(error)
      console.error(`${acceptanceLabel} temporary-directory cleanup failed: ${redact(error instanceof Error ? error.message : String(error), secrets)}`)
    }
    if (cleanupFailures.length === 1) cleanupError = cleanupFailures[0]
    else if (cleanupFailures.length > 1) cleanupError = new AggregateError(cleanupFailures, `${acceptanceLabel} cleanup failed`)
  }
  if (primaryError) {
    const message = primaryError instanceof Error ? primaryError.message : String(primaryError)
    console.error(`${acceptanceLabel} failed: ${redact(message, secrets)}`)
  }
  if (primaryError && cleanupError) throw new AggregateError([primaryError, cleanupError], `${acceptanceLabel} failed and cleanup failed`)
  if (primaryError) throw primaryError
  if (cleanupError) throw cleanupError
  for (const message of acceptanceContext?.successMessages ?? []) console.log(message)
  console.log(`${acceptanceLabel} passed: release tarball, migrations, Compose services, and selected acceptance tests.`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const argument = process.argv[2]
  if (!argument || argument === '--help' || argument === '-h') {
    if (!argument) {
      console.error('Usage: node scripts/first-run-acceptance.mjs <release-tarball>')
      process.exitCode = 1
    } else {
      console.log('Usage: node scripts/first-run-acceptance.mjs <release-tarball>')
    }
  } else {
    try {
      await runFirstRunAcceptance(argument)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`First-run acceptance failed: ${redact(message)}`)
      process.exitCode = 1
    }
  }
}
