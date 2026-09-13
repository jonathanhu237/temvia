import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  assertPlaywrightReport,
  playwrightCLIInvocation,
  redact,
  remaining,
  runCommand,
  runFirstRunAcceptance,
} from './first-run-acceptance.mjs'

// This is intentionally a small, fixed manifest. It exercises the durable
// security, settings, and mail seams without turning every historical browser
// scenario into a release gate.
export const criticalGoSuites = [
  {
    packagePath: './internal/auth/adapter/postgres',
    tests: [
      'TestStoreIntegrationSetupLifecycleAndConcurrency',
      'TestStoreIntegrationRejectsNonExactSchemaVersions',
      'TestStoreIntegrationOperationLogPersistenceAndRetention',
      'TestStoreIntegrationPasswordRecoveryOutboxAndVersionedSessions',
      'TestStoreIntegrationRBACAndInvitationLifecycle',
      'TestSystemIdentityIntegrationPersistsOneNameAndHasNoLegacyColumn',
      'TestPersonalSettingsStoreIntegrationEmailAuthorities',
      'TestUserLifecycleIntegration',
      'TestRevokeSessionsIntegration',
      'TestStateIntegrationSessionsPersistTouchWithoutTouchAndCleanup',
      'TestStateIntegrationTouchUsesDatabaseTimeAfterRowLock',
      'TestStateIntegrationLimiterSerializesCreationWithResetAndCleanup',
      'TestStoreIntegrationMailTaskWorkerPolicyAndMaterial',
      'TestStoreIntegrationMailTaskConcurrencyAndRetention',
    ],
  },
  {
    packagePath: './internal/auth/adapter/httpapi',
    tests: [
      'TestPersonalSettingsHTTPPostgresIntegration',
      'TestUserLifecycleHTTPIntegration',
      'TestOnlineHTTPIntegration',
      'TestMailTasksHTTPIntegration',
    ],
  },
]

export const criticalBrowserSuites = [
  {
    file: 'e2e/auth.spec.ts',
    grep: 'recovers the administrator password through the transactional mail flow',
    tests: ['recovers the administrator password through the transactional mail flow'],
  },
  {
    file: 'e2e/personal-account-settings.spec.ts',
    grep: 'keeps profile, preferences, avatar crop, and security controls account-scoped',
    tests: ['keeps profile, preferences, avatar crop, and security controls account-scoped'],
  },
  {
    file: 'e2e/email-tasks.spec.ts',
    tests: [
      'saves SMTP, submits an asynchronous test task, and observes delivery',
      'records a terminal failure, retries after a saved SMTP repair, reports bulk conflicts, and deletes physically',
    ],
  },
]

// `go test -count=2` repeats each selected top-level test. This is a
// per-test requirement, not a suite-wide pass threshold.
export const criticalGoMinimumRuns = 2
export const criticalBrowserPhaseOrder = Object.freeze([
  'smtp-bootstrap',
  'password-recovery',
  'personal-settings',
  'email-tasks',
])

function goTestPattern(testNames) {
  return `^(?:${testNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`
}

function goTestRoot(testName) {
  return testName.split('/', 1)[0]
}

/**
 * Parse the machine-readable Go test stream without treating package success or
 * a child subtest as selected-test success. A selected top-level test is the
 * execution unit: child pass events are useful context, but child skip/fail
 * events invalidate the mandatory parent behavior.
 */
export function summarizeGoTestJSON(output, expectedTests, label = 'Go integration', { minimumRuns = 1 } = {}) {
  if (!Number.isInteger(minimumRuns) || minimumRuns < 1) throw new Error(`${label} minimumRuns must be a positive integer`)
  const lines = String(output ?? '').split(/\r?\n/).filter(Boolean)
  const events = lines.map((line) => {
    try {
      return JSON.parse(line)
    } catch {
      throw new Error(`${label} emitted a non-JSON test event`)
    }
  })
  const expected = new Set(expectedTests)
  const terminalActions = new Set(['pass', 'fail', 'skip'])
  const testEvents = events.filter((event) => typeof event.Test === 'string' && terminalActions.has(event.Action))
  const topLevelEvents = testEvents.filter((event) => !event.Test.includes('/'))
  const roots = new Set(testEvents.map((event) => goTestRoot(event.Test)))
  const actual = new Set(topLevelEvents.map((event) => event.Test))
  const missing = [...expected].filter((name) => !actual.has(name))
  const unexpected = [...roots].filter((name) => !expected.has(name))
  const packageFailures = events.filter((event) => !event.Test && event.Action === 'fail')
  if (packageFailures.length) {
    throw new Error(`${label} reported ${packageFailures.length} package-level failure event(s)`)
  }
  if (missing.length || unexpected.length || topLevelEvents.length === 0) {
    throw new Error(`${label} selected ${topLevelEvents.length} top-level test event(s); missing=${missing.join(',') || 'none'} unexpected=${unexpected.join(',') || 'none'}`)
  }

  const skipped = []
  const failed = []
  for (const name of expected) {
    const parentEvents = topLevelEvents.filter((event) => event.Test === name)
    const descendants = testEvents.filter((event) => event.Test.startsWith(`${name}/`))
    const parentActions = parentEvents.map((event) => event.Action)
    const passCount = parentActions.filter((action) => action === 'pass').length
    const runCount = events.filter((event) => event.Test === name && event.Action === 'run').length
    const reasons = []
    if (parentActions.includes('skip') || descendants.some((event) => event.Action === 'skip')) {
      skipped.push(name)
    }
    if (parentActions.includes('fail') || descendants.some((event) => event.Action === 'fail')) {
      reasons.push('top-level or descendant failure')
    }
    if (passCount < minimumRuns) reasons.push(`${passCount} top-level pass event(s), required ${minimumRuns}`)
    // Real Go JSON includes one top-level run event per execution. Keep the
    // check conditional so focused parser fixtures may omit run events, while
    // never accepting an observed run stream that did not repeat as required.
    if (runCount > 0 && runCount < minimumRuns) reasons.push(`${runCount} top-level run event(s), required ${minimumRuns}`)
    if (reasons.length) failed.push(`${name} (${reasons.join('; ')})`)
  }
  if (skipped.length) throw new Error(`${label} skipped mandatory test(s): ${skipped.join(', ')}`)
  if (failed.length) throw new Error(`${label} did not pass mandatory test(s): ${failed.join(', ')}`)
  const runs = topLevelEvents.filter((event) => event.Action === 'pass').length
  const requiredRuns = minimumRuns * expected.size
  if (runs < requiredRuns) throw new Error(`${label} ran ${runs} top-level passing execution(s), fewer than the required ${requiredRuns}`)
  return { total: expected.size, passed: expected.size, skipped: 0, runs }
}

export function summarizeCriticalGoSuite(output, suite, label = `mandatory ${suite.packagePath}`) {
  return summarizeGoTestJSON(output, suite.tests, label, { minimumRuns: criticalGoMinimumRuns })
}

function goEnvironment(context, dsn) {
  const environment = { ...context.toolEnvironment }
  // A caller's GOFLAGS/GOWORK can silently change the selected package or
  // test mode. Dependency proxies remain available, but test selection is
  // controlled solely by this runner.
  for (const name of ['GOFLAGS', 'GOWORK']) delete environment[name]
  environment.CGO_ENABLED = '1'
  environment.TEST_POSTGRES_DSN = dsn
  environment.TEMVIA_REQUIRED_INTEGRATION = '1'
  environment.E2E_EMAIL_TASKS = '1'
  return environment
}

export async function runCriticalGoAcceptance(context, options = {}) {
  const { postgres } = context.ports
  const password = options.postgresPassword ?? context.postgresPassword
  if (!password) throw new Error('critical acceptance could not establish the isolated PostgreSQL credential')
  const dsn = `postgres://temvia:${encodeURIComponent(password)}@127.0.0.1:${postgres}/temvia?sslmode=disable`
  context.secrets.push(dsn)
  const environment = goEnvironment(context, dsn)
  const executeCommand = options.runCommand ?? runCommand
  const summaries = []
  for (const suite of criticalGoSuites) {
    const pattern = goTestPattern(suite.tests)
    const args = [
      'test',
      '-race',
      '-json',
      '-mod=readonly',
      '-count=2',
      '-p=1',
      '-timeout=8m',
      '-run',
      pattern,
      suite.packagePath,
    ]
    const result = await executeCommand('go', args, {
      cwd: `${context.projectDirectory}/api`,
      env: environment,
      timeout: Math.min(options.commandTimeout ?? 12 * 60_000, remaining(context.deadline)),
      secrets: context.secrets,
      label: `run mandatory ${suite.packagePath} PostgreSQL/HTTP tests`,
    })
    summaries.push(summarizeCriticalGoSuite(result.stdout, suite))
  }
  return summaries
}

function responseSetCookies(response) {
  const headers = response?.headers
  if (!headers) return []
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const value = typeof headers.get === 'function' ? headers.get('set-cookie') : undefined
  return value ? [value] : []
}

function sessionCookieFrom(response) {
  for (const value of responseSetCookies(response)) {
    const cookie = String(value).split(';', 1)[0].trim()
    if (/^[^=;]+=[^;]+$/.test(cookie)) return cookie
  }
  return undefined
}

const smtpBootstrapRequestTimeout = 15_000

function smtpBootstrapRequestDeadline(context, label) {
  const now = Date.now()
  const acceptanceDeadline = Number.isFinite(context?.deadline)
    ? context.deadline
    : now + smtpBootstrapRequestTimeout
  const requestDeadline = Math.min(acceptanceDeadline, now + smtpBootstrapRequestTimeout)
  if (requestDeadline <= now) throw new Error(`${label} request timed out`)
  return requestDeadline
}

async function withSMTPBootstrapBudget(context, label, operation) {
  const requestDeadline = smtpBootstrapRequestDeadline(context, label)
  const controller = new AbortController()
  let timer
  let rejectTimeout
  const timeout = new Promise((_, reject) => {
    rejectTimeout = reject
    timer = setTimeout(() => {
      rejectTimeout(new Error(`${label} request timed out`))
      controller.abort()
    }, Math.max(0, requestDeadline - Date.now()))
  })
  try {
    // Promise.race is intentional in addition to AbortController: the real
    // fetch implementation observes the signal, while a test double or a
    // broken adapter must not hold the acceptance gate open indefinitely.
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

async function readJSONResponse(response, label) {
  try {
    return await response.json()
  } catch {
    throw new Error(`${label} returned malformed JSON`)
  }
}

async function authenticatedSettingsRequest(fetcher, context, path, options, expectedStatus, label) {
  let result
  try {
    result = await withSMTPBootstrapBudget(context, label, async (signal) => {
      const response = await fetcher(new URL(path, context.origin), { ...options, signal })
      if (response.status !== expectedStatus) return { response }
      return { response, payload: await readJSONResponse(response, label) }
    })
  } catch (error) {
    // Keep malformed-response diagnostics useful, but never expose an adapter
    // error, response body, or credential when a request or body read aborts.
    if (error instanceof Error && error.message === `${label} returned malformed JSON`) throw error
    throw new Error(`${label} request failed`)
  }
  if (result.response.status !== expectedStatus) throw new Error(`${label} returned HTTP ${result.response.status}`)
  return result.payload
}

function emailSettingsEnvelope(payload, label) {
  const email = payload && typeof payload === 'object' && payload.email
  if (!email || typeof email !== 'object' || !Number.isInteger(email.revision) || email.revision < 0) {
    throw new Error(`${label} did not return an email-settings revision`)
  }
  return email
}

export function assertCriticalBrowserPrerequisites(context) {
  if (context?.firstRunResult?.total !== 1 || context.firstRunResult.passed !== 1 || context.firstRunResult.skipped !== 0) {
    throw new Error('critical browser phases require a passing first-run setup and login phase')
  }
  if (!context?.origin || !context.adminCredentials?.email || !context.adminCredentials?.password) {
    throw new Error('critical browser phases require private administrator credentials and an application origin')
  }
  if (!Number.isInteger(context?.ports?.mailpit) || context.ports.mailpit < 1) {
    throw new Error('critical browser phases require an isolated Mailpit port')
  }
}

export function assertCriticalBrowserPhaseOrder(context, nextPhase) {
  const nextIndex = criticalBrowserPhaseOrder.indexOf(nextPhase)
  const currentPhase = context.criticalBrowserPhase
  const currentIndex = currentPhase === undefined || currentPhase === 'first-run' ? -1 : criticalBrowserPhaseOrder.indexOf(currentPhase)
  if (nextIndex < 0 || (currentPhase !== undefined && currentPhase !== 'first-run' && currentIndex < 0) || nextIndex !== currentIndex + 1) {
    throw new Error(`critical browser phase ${nextPhase} was not scheduled after ${currentPhase ?? 'first-run'}`)
  }
}

/**
 * The first-run browser test only creates and signs in the administrator. The
 * recovery phase needs a saved SMTP row, so establish it through the same
 * authenticated HTTP settings endpoint a browser uses. Credentials and the
 * session cookie stay in this context and are never included in diagnostics.
 */
export async function bootstrapMailpitSMTP(context, options = {}) {
  assertCriticalBrowserPrerequisites(context)
  const fetcher = Object.prototype.hasOwnProperty.call(options, 'fetch') ? options.fetch : globalThis.fetch
  if (typeof fetcher !== 'function') throw new Error('critical browser SMTP bootstrap requires fetch')
  const host = options.host ?? 'mailpit'
  const port = options.port ?? 1025
  const security = options.security ?? 'none'
  const defaultLocale = options.defaultLocale ?? 'en'
  const autoRetryCount = options.autoRetryCount ?? 9
  const retentionDays = options.retentionDays ?? 30
  const { email, password } = context.adminCredentials
  const requestHeaders = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: context.origin,
  }
  let loginResponse
  try {
    loginResponse = await withSMTPBootstrapBudget(context, 'critical browser SMTP bootstrap login', (signal) => fetcher(new URL('/api/auth/login', context.origin), {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ email, password, locale: defaultLocale }),
      signal,
    }))
  } catch {
    throw new Error('critical browser SMTP bootstrap login request failed')
  }
  if (loginResponse.status !== 200) throw new Error(`critical browser SMTP bootstrap login returned HTTP ${loginResponse.status}`)
  let sessionCookie
  try {
    sessionCookie = sessionCookieFrom(loginResponse)
  } catch {
    throw new Error('critical browser SMTP bootstrap login did not return an authenticated session cookie')
  }
  if (!sessionCookie) throw new Error('critical browser SMTP bootstrap login did not return an authenticated session cookie')
  context.secrets.push(sessionCookie)

  const authenticatedHeaders = { ...requestHeaders, Cookie: sessionCookie }
  const currentPayload = await authenticatedSettingsRequest(fetcher, context, '/api/settings/email', {
    method: 'GET',
    headers: authenticatedHeaders,
  }, 200, 'critical browser SMTP bootstrap settings read')
  const current = emailSettingsEnvelope(currentPayload, 'critical browser SMTP bootstrap settings read')
  const savedPayload = await authenticatedSettingsRequest(fetcher, context, '/api/settings/email', {
    method: 'PUT',
    headers: authenticatedHeaders,
    body: JSON.stringify({
      host,
      port,
      security,
      username: '',
      clearPassword: true,
      fromAddress: 'no-reply@example.com',
      fromName: 'Temvia Acceptance',
      defaultLocale,
      autoRetryCount,
      retentionDays,
      revision: current.revision,
    }),
  }, 200, 'critical browser SMTP bootstrap settings save')
  const saved = emailSettingsEnvelope(savedPayload, 'critical browser SMTP bootstrap settings save')
  if (saved.revision <= current.revision || saved.configured !== true || saved.host !== host || saved.port !== port || saved.security !== security || saved.fromAddress !== 'no-reply@example.com' || saved.fromName !== 'Temvia Acceptance' || saved.defaultLocale !== defaultLocale || saved.autoRetryCount !== autoRetryCount || saved.retentionDays !== retentionDays) {
    throw new Error('critical browser SMTP bootstrap did not persist the required Mailpit settings')
  }
  return { host, port, security, defaultLocale, autoRetryCount, retentionDays, revision: saved.revision }
}

export async function runCriticalBrowserSuite(context, suite, environment, options = {}) {
  const args = ['test', suite.file, '--workers=1', '--reporter=json']
  if (suite.grep) args.push('--grep', suite.grep)
  const invocation = playwrightCLIInvocation(context.adminDirectory, args)
  const executeCommand = options.runCommand ?? runCommand
  const result = await executeCommand(invocation.command, invocation.args, {
    cwd: context.adminDirectory,
    env: environment,
    timeout: Math.min(8 * 60_000, remaining(context.deadline)),
    secrets: context.secrets,
    includeOutput: false,
    label: `run mandatory browser suite ${suite.file} (${suite.tests.join('; ')})`,
  })
  return assertPlaywrightReport(result.stdout, suite.tests, `mandatory browser suite ${suite.file}`)
}

export async function runCriticalBrowserAcceptance(context, options = {}) {
  assertCriticalBrowserPrerequisites(context)
  const resetPassword = options.resetPassword ?? 'AcceptanceReset1!x'
  context.secrets.push(resetPassword)
  const initialEnvironment = context.browserEnv
  if (!initialEnvironment) throw new Error('critical browser phases require the first-run browser environment')
  const bootstrap = options.bootstrapMailpitSMTP ?? bootstrapMailpitSMTP
  const runSuite = options.runBrowserSuite ?? runCriticalBrowserSuite

  // The first-run test creates the administrator but deliberately does not
  // provision SMTP. Bootstrap it before the recovery test, rather than relying
  // on integration-test rows that run in a separate database phase.
  assertCriticalBrowserPhaseOrder(context, 'smtp-bootstrap')
  context.mailpitSMTP = await bootstrap(context, options)
  context.criticalBrowserPhase = 'smtp-bootstrap'

  assertCriticalBrowserPhaseOrder(context, 'password-recovery')
  const authSummary = await runSuite(context, criticalBrowserSuites[0], initialEnvironment)
  context.criticalBrowserPhase = 'password-recovery'

  // Password recovery deliberately invalidates every existing session. Carry
  // the new fixture password into later browser phases rather than allowing a
  // stale environment value to make those phases fail for the wrong reason.
  const currentEnvironment = {
    ...initialEnvironment,
    E2E_ADMIN_PASSWORD: resetPassword,
    E2E_PERSONAL_SETTINGS: '1',
    E2E_PERSONAL_EMAIL: context.adminCredentials.email,
    E2E_PERSONAL_PASSWORD: resetPassword,
    E2E_EMAIL_TASKS: '1',
    E2E_MAILPIT_API_URL: `http://127.0.0.1:${context.ports.mailpit}`,
    E2E_SMTP_HOST: context.mailpitSMTP.host,
    E2E_SMTP_PORT: String(context.mailpitSMTP.port),
    E2E_SMTP_RETRY_COUNT: String(context.mailpitSMTP.autoRetryCount),
    E2E_MAIL_DEFAULT_LOCALE: context.mailpitSMTP.defaultLocale,
    E2E_BAD_SMTP_HOST: '127.0.0.1',
    E2E_BAD_SMTP_PORT: '1',
  }
  context.secrets.push(context.adminCredentials.email, resetPassword)

  assertCriticalBrowserPhaseOrder(context, 'personal-settings')
  const personalSummary = await runSuite(context, criticalBrowserSuites[1], currentEnvironment)
  context.criticalBrowserPhase = 'personal-settings'

  assertCriticalBrowserPhaseOrder(context, 'email-tasks')
  const mailSummary = await runSuite(context, criticalBrowserSuites[2], currentEnvironment)
  context.criticalBrowserPhase = 'email-tasks'
  return [authSummary, personalSummary, mailSummary]
}

export async function runCriticalAcceptance(tarballPath, options = {}) {
  const adminCredentials = options.adminCredentials ?? {
    email: 'acceptance-admin@example.com',
    password: 'Admin1!x',
    name: 'Acceptance Admin',
  }
  if (!adminCredentials || typeof adminCredentials !== 'object') throw new Error('critical acceptance administrator credentials are required')
  for (const [field, value] of Object.entries(adminCredentials)) {
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`critical acceptance administrator ${field} is required`)
  }
  const resetPassword = options.resetPassword ?? 'AcceptanceReset1!x'
  if (typeof resetPassword !== 'string' || resetPassword.trim() === '') throw new Error('critical acceptance reset password is required')
  const browserEnvironment = (context) => ({
    E2E_RESET_PASSWORD: resetPassword,
    // These variables are intentionally set by the runner, not inherited from
    // the caller. The selected suites still receive their mandatory toggles.
    E2E_EMAIL_TASKS: '1',
    E2E_MAILPIT_API_URL: `http://127.0.0.1:${context.ports.mailpit}`,
  })
  return runFirstRunAcceptance(tarballPath, {
    ...options,
    acceptanceLabel: 'Critical acceptance',
    totalTimeout: options.totalTimeout ?? 45 * 60_000,
    requireMailpit: true,
    adminCredentials,
    browserEnvironment,
    beforeServices: async (context) => {
      // The generated environment keeps the password in this in-memory
      // context only; it is never recovered from logs or command output. Run
      // database tests before the API/worker starts so fixture cleanup cannot
      // race the live dispatcher.
      context.postgresPassword = options.postgresPassword ?? context.postgresPassword
      if (!context.postgresPassword) {
        throw new Error('critical acceptance was not given its isolated PostgreSQL password')
      }
      const goSummary = await runCriticalGoAcceptance(context, { ...options, postgresPassword: context.postgresPassword })
      context.goSummary = goSummary
    },
    afterFirstRun: async (context) => {
      context.browserSummary = await runCriticalBrowserAcceptance(context, { resetPassword })
      const goRuns = context.goSummary.reduce((total, summary) => total + summary.runs, 0)
      const goTests = context.goSummary.reduce((total, summary) => total + summary.total, 0)
      const browserTests = context.firstRunResult.total + context.browserSummary.reduce((total, summary) => total + summary.total, 0)
      if (!context.successMessages) context.successMessages = []
      context.successMessages.push(`Critical acceptance evidence: PostgreSQL/HTTP ${goTests} selected tests, ${goRuns} passing executions; browser ${browserTests} selected tests, all passed; skipped 0.`)
    },
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const argument = process.argv[2] ?? process.env.TEMVIA_TEST_TARBALL
  if (!argument || argument === '--help' || argument === '-h') {
    if (!argument) {
      console.error('Usage: node scripts/critical-acceptance.mjs <release-tarball> (or set TEMVIA_TEST_TARBALL)')
      process.exitCode = 1
    } else {
      console.log('Usage: node scripts/critical-acceptance.mjs <release-tarball>')
    }
  } else {
    try {
      await runCriticalAcceptance(argument)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Critical acceptance failed: ${redact(message)}`)
      process.exitCode = 1
    }
  }
}
