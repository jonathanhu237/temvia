import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  assertPlaywrightReport,
  redact,
  runCommand,
} from '../scripts/first-run-acceptance.mjs'
import {
  assertCriticalBrowserPhaseOrder,
  bootstrapMailpitSMTP,
  criticalBrowserPhaseOrder,
  criticalGoMinimumRuns,
  criticalGoSuites,
  runCriticalBrowserAcceptance,
  runCriticalBrowserSuite,
  runCriticalGoAcceptance,
  summarizeGoTestJSON,
} from '../scripts/critical-acceptance.mjs'

test('mandatory browser report rejects zero, skipped, missing, and failed tests', () => {
  const title = 'critical browser behavior'
  const passed = JSON.stringify({ suites: [{ specs: [{ title, tests: [{ status: 'expected', results: [{ status: 'passed' }] }] }] }] })
  assert.deepEqual(assertPlaywrightReport(passed, [title]), { total: 1, passed: 1, skipped: 0 })

  const skipped = JSON.stringify({ suites: [{ specs: [{ title, tests: [{ status: 'skipped', results: [] }] }] }] })
  assert.throws(() => assertPlaywrightReport(skipped, [title]), /skipped mandatory/)
  assert.throws(() => assertPlaywrightReport('{"suites":[]}', [title]), /missing=.*critical browser behavior/)
  assert.throws(() => assertPlaywrightReport(JSON.stringify({ suites: [{ specs: [{ title, tests: [{ status: 'unexpected', results: [{ status: 'failed' }] }] }] }] }), [title]), /did not pass/)
})

test('mandatory Go report counts only top-level executions and rejects descendants/package failures', () => {
  const output = [
    { Action: 'run', Test: 'TestOne' },
    { Action: 'run', Test: 'TestOne/required-child' },
    { Action: 'pass', Test: 'TestOne/required-child' },
    { Action: 'pass', Test: 'TestOne' },
    { Action: 'run', Test: 'TestOne' },
    { Action: 'pass', Test: 'TestOne/required-child' },
    { Action: 'pass', Test: 'TestOne' },
    { Action: 'run', Test: 'TestTwo' },
    { Action: 'pass', Test: 'TestTwo' },
  ].map(JSON.stringify).join('\n')
  assert.deepEqual(summarizeGoTestJSON(output, ['TestOne', 'TestTwo']), { total: 2, passed: 2, skipped: 0, runs: 3 })
  assert.throws(() => summarizeGoTestJSON(JSON.stringify({ Action: 'pass', Test: 'TestOne' }), ['TestOne'], 'repeat fixture', { minimumRuns: 2 }), /required 2/)

  const repeated = [
    { Action: 'run', Test: 'TestOne' },
    { Action: 'run', Test: 'TestOne/child' },
    { Action: 'pass', Test: 'TestOne/child' },
    { Action: 'pass', Test: 'TestOne' },
    { Action: 'run', Test: 'TestOne' },
    { Action: 'pass', Test: 'TestOne/child' },
    { Action: 'pass', Test: 'TestOne' },
  ].map(JSON.stringify).join('\n')
  assert.deepEqual(summarizeGoTestJSON(repeated, ['TestOne'], 'repeated fixture', { minimumRuns: 2 }), { total: 1, passed: 1, skipped: 0, runs: 2 })

  const skipped = [
    { Action: 'run', Test: 'TestOne' },
    { Action: 'run', Test: 'TestOne/Required' },
    { Action: 'skip', Test: 'TestOne/Required' },
    { Action: 'pass', Test: 'TestOne' },
  ].map(JSON.stringify).join('\n')
  assert.throws(() => summarizeGoTestJSON(skipped, ['TestOne']), /skipped mandatory/)
  const failedDescendant = [
    { Action: 'run', Test: 'TestOne' },
    { Action: 'run', Test: 'TestOne/critical-boundary' },
    { Action: 'fail', Test: 'TestOne/critical-boundary' },
    { Action: 'pass', Test: 'TestOne' },
  ].map(JSON.stringify).join('\n')
  assert.throws(() => summarizeGoTestJSON(failedDescendant, ['TestOne']), /did not pass/)
  assert.throws(() => summarizeGoTestJSON(`${output}\n${JSON.stringify({ Action: 'fail', Package: 'pkg' })}`, ['TestOne', 'TestTwo']), /package-level failure/)
  assert.throws(() => summarizeGoTestJSON(JSON.stringify({ Action: 'pass', Test: 'Unexpected/child' }), ['TestOne']), /missing=.*TestOne.*unexpected=Unexpected/)
  assert.throws(() => summarizeGoTestJSON('', ['TestOne']), /missing=.*TestOne/)
  assert.throws(() => summarizeGoTestJSON('not json', ['TestOne']), /non-JSON/)
  const failed = [JSON.stringify({ Action: 'fail', Test: 'TestOne' }), JSON.stringify({ Action: 'pass', Test: 'TestOne' })].join('\n')
  assert.throws(() => summarizeGoTestJSON(failed, ['TestOne']), /did not pass/)
})

test('critical Go caller applies count=2 per selected test, not per-suite', async () => {
  assert.equal(criticalGoMinimumRuns, 2)
  let calls = 0
  const context = {
    ports: { postgres: 5432 },
    postgresPassword: 'private-postgres-password',
    projectDirectory: process.cwd(),
    toolEnvironment: {},
    secrets: [],
    deadline: Date.now() + 30_000,
  }
  const summaries = await runCriticalGoAcceptance(context, {
    runCommand: async (_command, args) => {
      calls += 1
      assert.equal(args.find((argument) => argument.startsWith('-count=')), '-count=2')
      const suite = criticalGoSuites[calls - 1]
      const events = []
      for (let run = 0; run < criticalGoMinimumRuns; run += 1) {
        for (const name of suite.tests) {
          events.push({ Action: 'run', Test: name })
          events.push({ Action: 'run', Test: `${name}/critical-child` })
          events.push({ Action: 'pass', Test: `${name}/critical-child` })
          events.push({ Action: 'pass', Test: name })
        }
      }
      return { stdout: events.map(JSON.stringify).join('\n'), stderr: '' }
    },
  })
  assert.equal(calls, criticalGoSuites.length)
  assert.deepEqual(summaries.map((summary) => summary.runs), criticalGoSuites.map((suite) => suite.tests.length * criticalGoMinimumRuns))
})

test('critical browser suite runs the pinned local CLI directly without implicit dependency installation', async () => {
  const title = 'critical browser behavior'
  const context = {
    adminDirectory: join(tmpdir(), 'temvia-generated-admin'),
    deadline: Date.now() + 30_000,
    secrets: [],
  }
  const calls = []
  const summary = await runCriticalBrowserSuite(context, {
    file: 'e2e/auth.spec.ts',
    grep: title,
    tests: [title],
  }, { CI: 'true' }, {
    runCommand: async (command, args, options) => {
      calls.push({ command, args, options })
      return {
        stdout: JSON.stringify({ suites: [{ specs: [{ title, tests: [{ status: 'expected', results: [{ status: 'passed' }] }] }] }] }),
        stderr: '',
      }
    },
  })
  assert.deepEqual(summary, { total: 1, passed: 1, skipped: 0 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, process.execPath)
  assert.equal(calls[0].args[0], join(context.adminDirectory, 'node_modules', '@playwright', 'test', 'cli.js'))
  assert.deepEqual(calls[0].args.slice(1), ['test', 'e2e/auth.spec.ts', '--workers=1', '--reporter=json', '--grep', title])
  assert.equal(calls[0].args.includes('exec'), false)
})

test('critical browser phases require first-run prerequisites and remain ordered', () => {
  const context = {}
  assert.deepEqual(criticalBrowserPhaseOrder, ['smtp-bootstrap', 'password-recovery', 'personal-settings', 'email-tasks'])
  assertCriticalBrowserPhaseOrder(context, 'smtp-bootstrap')
  context.criticalBrowserPhase = 'smtp-bootstrap'
  assertCriticalBrowserPhaseOrder(context, 'password-recovery')
  assert.throws(() => assertCriticalBrowserPhaseOrder(context, 'email-tasks'), /was not scheduled/)
})

test('critical browser caller bootstraps SMTP before recovery and hands reset credentials forward', async () => {
  const context = {
    firstRunResult: { total: 1, passed: 1, skipped: 0 },
    origin: 'http://127.0.0.1:43123',
    adminCredentials: { email: 'private-admin@example.test', password: 'PrivateAdmin1!x', name: 'Private Admin' },
    ports: { mailpit: 44321 },
    secrets: [],
    browserEnv: { E2E_ADMIN_EMAIL: 'private-admin@example.test', E2E_ADMIN_PASSWORD: 'PrivateAdmin1!x' },
  }
  const phases = []
  const summaries = [{ total: 1, passed: 1, skipped: 0 }, { total: 1, passed: 1, skipped: 0 }, { total: 2, passed: 2, skipped: 0 }]
  const result = await runCriticalBrowserAcceptance(context, {
    resetPassword: 'PrivateReset1!x',
    bootstrapMailpitSMTP: async () => {
      phases.push('smtp-bootstrap')
      return { host: 'mailpit', port: 1025, security: 'none', defaultLocale: 'en', autoRetryCount: 9, retentionDays: 30, revision: 1 }
    },
    runBrowserSuite: async (_context, suite, environment) => {
      phases.push(suite.file)
      if (suite.file.includes('personal')) {
        assert.equal(environment.E2E_PERSONAL_EMAIL, context.adminCredentials.email)
        assert.equal(environment.E2E_PERSONAL_PASSWORD, 'PrivateReset1!x')
        assert.equal(environment.E2E_ADMIN_PASSWORD, 'PrivateReset1!x')
      }
      if (suite.file.includes('email-tasks')) {
        assert.equal(environment.E2E_SMTP_PORT, '1025')
        assert.equal(environment.E2E_SMTP_RETRY_COUNT, '9')
        assert.equal(environment.E2E_MAIL_DEFAULT_LOCALE, 'en')
      }
      return summaries[phases.length - 2]
    },
  })
  assert.deepEqual(phases, ['smtp-bootstrap', 'e2e/auth.spec.ts', 'e2e/personal-account-settings.spec.ts', 'e2e/email-tasks.spec.ts'])
  assert.deepEqual(result, summaries)
  assert.equal(context.criticalBrowserPhase, 'email-tasks')
})

test('Mailpit bootstrap uses the authenticated settings API and persists the private fixture', async () => {
  const calls = []
  const context = {
    firstRunResult: { total: 1, passed: 1, skipped: 0 },
    origin: 'http://127.0.0.1:43123',
    adminCredentials: { email: 'private-admin@example.test', password: 'PrivateAdmin1!x', name: 'Private Admin' },
    ports: { mailpit: 44321 },
    secrets: [],
    deadline: Date.now() + 30_000,
  }
  const fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    if (calls.length === 1) {
      return { status: 200, headers: { getSetCookie: () => ['temvia_session=private-session-value; Path=/'] }, json: async () => ({}) }
    }
    if (calls.length === 2) {
      return { status: 200, headers: { get: () => null }, json: async () => ({ email: { configured: false, revision: 0 } }) }
    }
    return { status: 200, headers: { get: () => null }, json: async () => ({ email: { configured: true, host: 'mailpit', port: 1025, security: 'none', fromAddress: 'no-reply@example.com', fromName: 'Temvia Acceptance', defaultLocale: 'en', autoRetryCount: 9, retentionDays: 30, revision: 1 } }) }
  }
  const settings = await bootstrapMailpitSMTP(context, { fetch })
  assert.deepEqual(settings, { host: 'mailpit', port: 1025, security: 'none', defaultLocale: 'en', autoRetryCount: 9, retentionDays: 30, revision: 1 })
  assert.equal(calls[0].url, `${context.origin}/api/auth/login`)
  assert.equal(calls[1].url, `${context.origin}/api/settings/email`)
  assert.equal(calls[2].url, `${context.origin}/api/settings/email`)
  assert.equal(calls[0].options.headers.Origin, context.origin)
  assert.ok(calls[0].options.signal instanceof AbortSignal)
  for (const call of calls.slice(1)) {
    assert.equal(call.options.headers.Cookie, 'temvia_session=private-session-value')
    assert.equal(call.options.headers.Origin, context.origin)
    assert.equal(call.options.headers['Content-Type'], 'application/json')
    assert.ok(call.options.signal instanceof AbortSignal)
  }
  assert.equal(JSON.parse(calls[2].options.body).revision, 0)
  assert.equal(JSON.parse(calls[2].options.body).clearPassword, true)
  assert.deepEqual(context.secrets, ['temvia_session=private-session-value'])
})

test('Mailpit bootstrap rejects missing prerequisites and dependencies', async () => {
  await assert.rejects(
    bootstrapMailpitSMTP({ firstRunResult: { total: 1, passed: 0, skipped: 0 }, origin: 'http://127.0.0.1:1', adminCredentials: { email: 'a', password: 'b' }, ports: { mailpit: 2 }, secrets: [] }, { fetch: async () => ({}) }),
    /passing first-run/,
  )
  await assert.rejects(
    bootstrapMailpitSMTP({ firstRunResult: { total: 1, passed: 1, skipped: 0 }, origin: 'http://127.0.0.1:1', adminCredentials: { email: 'a', password: 'b' }, ports: { mailpit: 2 }, secrets: [] }, { fetch: undefined }),
    /requires fetch/,
  )
})

test('Mailpit bootstrap aborts a hung response read before the gate deadline without private diagnostics', async () => {
  const privateValues = ['private response body', 'private-session-cookie', 'PrivatePassword1!x']
  const context = {
    firstRunResult: { total: 1, passed: 1, skipped: 0 },
    origin: 'http://127.0.0.1:43123',
    adminCredentials: { email: 'private-admin@example.test', password: privateValues[2], name: 'Private Admin' },
    ports: { mailpit: 44321 },
    secrets: [],
    deadline: Date.now() + 50,
  }
  const signals = []
  const fetch = async (_url, options = {}) => {
    signals.push(options.signal)
    if (signals.length === 1) {
      return { status: 200, headers: { getSetCookie: () => ['temvia_session=private-session-cookie; Path=/'] }, json: async () => ({}) }
    }
    return {
      status: 200,
      json: () => new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error(`body=${privateValues[0]} cookie=${privateValues[1]} password=${privateValues[2]}`)), { once: true })
      }),
    }
  }

  await assert.rejects(
    bootstrapMailpitSMTP(context, { fetch }),
    (error) => {
      assert.match(error.message, /settings read request failed/)
      for (const value of privateValues) assert.doesNotMatch(error.message, new RegExp(value.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')))
      return true
    },
  )
  assert.equal(signals.length, 2)
  assert.ok(signals.every((signal) => signal instanceof AbortSignal))
  assert.ok(signals[1].aborted)
})

test('acceptance diagnostics redact credentials, security URLs, codes, and content', () => {
  const diagnostic = redact(
    'password=super-secret https://admin.example.test/reset-password#token=v1.abcdefghijklmnopqrstuv.abcdefghijklmnopqrstuvwxyz12345678901234567890123 code: 123456 body="private email body"',
    ['super-secret'],
  )
  assert.doesNotMatch(diagnostic, /super-secret|https:\/\/admin\.example\.test|123456|private email body/)
  assert.match(diagnostic, /REDACTED/)
})

test('command failures distinguish missing dependencies and timeouts', async () => {
  await assert.rejects(
    runCommand('temvia-command-that-is-not-installed', [], { label: 'required dependency fixture' }),
    /required command is unavailable/,
  )
  await assert.rejects(
    runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 500)'], { timeout: 50, label: 'timeout fixture' }),
    /timed out/,
  )
  await assert.rejects(
    runCommand(process.execPath, ['-e', 'console.error("private body"); process.exit(1)'], { includeOutput: false, label: 'private-output fixture' }),
    (error) => !error.message.includes('private body'),
  )
})
