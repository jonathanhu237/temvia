import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const totalTimeout = 20 * 60_000
const commandTimeout = 15 * 60_000
const cleanupTimeout = 2 * 60_000
const pollInterval = 500

const acceptanceRoutingPrefixes = ['COMPOSE_', 'E2E_', 'PLAYWRIGHT_', 'POSTGRES_', 'PG']
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
  // Do not let npm configuration change where the release is installed or
  // which registry is consulted. Keep npm's proxy variables untouched so a
  // restricted runner can still fetch the generated admin dependencies.
  'NPM_CONFIG_PREFIX',
  'npm_config_prefix',
  'NPM_CONFIG_GLOBAL',
  'npm_config_global',
  'NPM_CONFIG_USERCONFIG',
  'npm_config_userconfig',
  'NPM_CONFIG_REGISTRY',
  'npm_config_registry',
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
  return Object.fromEntries(Object.entries(sourceEnvironment).filter(([name]) => !isAcceptanceRoutingEnvironmentName(name)))
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

export function createBrowserEnvironment(composeEnvironment, { setupURL, origin, email, password, name }) {
  const environment = sanitizeAcceptanceEnvironment(composeEnvironment)
  return {
    ...environment,
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

function redact(value, secrets = []) {
  let result = String(value ?? '')
  // Setup authorities and reset/session credentials must never appear in CI
  // diagnostics, even when a child process includes an API log in its error.
  result = result.replace(/(#token=)[A-Za-z0-9_-]+/g, '$1[REDACTED]')
  result = result.replace(/\bv1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, '[REDACTED-TOKEN]')
  for (const secret of secrets) {
    if (secret) result = result.replace(new RegExp(escapeRegExp(secret), 'g'), '[REDACTED]')
  }
  return result
}

function truncate(value, limit = 6_000) {
  const text = String(value ?? '')
  return text.length <= limit ? text : `${text.slice(-limit)}\n[…diagnostics truncated…]`
}

function remaining(deadline) {
  const value = deadline - Date.now()
  if (value <= 0) throw new Error('first-run acceptance exceeded its total timeout')
  return value
}

async function runCommand(command, args, options = {}) {
  const { cwd, env, timeout = commandTimeout, secrets = [], label = `${command} ${args.join(' ')}` } = options
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
    const details = [stdout, stderr].filter(Boolean).map((value) => truncate(redact(value, secrets))).join('\n')
    throw new Error(`${label} failed${details ? `:\n${details}` : ''}`, { cause: error })
  }
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
  const deadline = Date.now() + (options.totalTimeout ?? totalTimeout)
  const temporary = await mkdtemp(join(tmpdir(), 'temvia-first-run-'))
  const toolEnvironment = sanitizeAcceptanceEnvironment()
  const consumer = join(temporary, 'consumer')
  const projectDirectory = join(temporary, 'generated-project')
  const secrets = []
  let projectName
  let compose
  let cleanupError
  try {
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
    const postgresPassword = randomBytes(24).toString('base64url')
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
      env: await createAcceptanceEnvironment(projectDirectory, projectName),
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
    await runCommand('make', ['up'], {
      cwd: projectDirectory,
      env: compose.env,
      timeout: Math.min(commandTimeout, remaining(deadline)),
      secrets,
      label: 'start the generated API and admin',
    })
    await waitForHTTP(`http://127.0.0.1:${apiPort}/health`, Math.min(deadline, Date.now() + 120_000))
    await waitForHTTP(origin, Math.min(deadline, Date.now() + 120_000))
    const setupURL = await readSetupLink(compose, origin, deadline, secrets)
    const setupToken = new URL(setupURL).hash.slice('#token='.length)
    secrets.push(setupToken)

    const adminDirectory = join(projectDirectory, 'admin')
    await runCommand('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], {
      cwd: adminDirectory,
      env: toolEnvironment,
      timeout: Math.min(commandTimeout, remaining(deadline)),
      label: 'install the generated admin test dependencies',
    })
    secrets.push('acceptance-admin@example.com', 'Admin1!x', 'Acceptance Admin')
    const browserEnv = createBrowserEnvironment(compose.env, {
      setupURL,
      origin,
      email: 'acceptance-admin@example.com',
      password: 'Admin1!x',
      name: 'Acceptance Admin',
    })
    await runCommand('pnpm', ['exec', 'playwright', 'install', 'chromium'], {
      cwd: adminDirectory,
      env: browserEnv,
      timeout: Math.min(commandTimeout, remaining(deadline)),
      secrets,
      label: 'install the Playwright browser for the acceptance gate',
    })
    await runCommand('pnpm', ['exec', 'playwright', 'test', 'e2e/first-run.spec.ts', '--workers=1'], {
      cwd: adminDirectory,
      env: browserEnv,
      timeout: Math.min(commandTimeout, remaining(deadline)),
      secrets,
      label: 'run the browser first-run setup and login gate',
    })
    console.log('First-run acceptance passed: release tarball, migrations, Compose services, setup, and login.')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`First-run acceptance failed: ${redact(message, secrets)}`)
    if (compose) {
      const logs = await tryCommand('docker', ['compose', '--project-name', projectName, 'logs', '--no-color', '--tail', '200'], {
        cwd: projectDirectory,
        env: compose.env,
        timeout: cleanupTimeout,
        secrets,
        label: 'collect Compose diagnostics',
      })
      if (logs) console.error(truncate(redact(`${logs.stdout}\n${logs.stderr}`, secrets)))
    }
    throw error
  } finally {
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
        cleanupError = error
        console.error(`First-run acceptance cleanup failed: ${redact(error instanceof Error ? error.message : String(error), secrets)}`)
      }
    }
    await rm(temporary, { recursive: true, force: true })
  }
  if (cleanupError) throw cleanupError
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
    } catch {
      process.exitCode = 1
    }
  }
}
