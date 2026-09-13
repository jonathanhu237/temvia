import assert from 'node:assert/strict'
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  cleanupAcceptanceTemporaryDirectory,
  createAcceptanceEnvironment,
  createBrowserEnvironment,
  playwrightCLIInvocation,
  prepareOwnedGoModuleCacheForCleanup,
  runCommand,
  runFirstRunAcceptance,
  sanitizeAcceptanceEnvironment,
} from '../scripts/first-run-acceptance.mjs'

test('upgrade guides make private durable backups and stop on each failed step', async (t) => {
  for (const guideName of ['README.md', 'README.zh-CN.md']) {
    const guide = await readFile(new URL(`../template/${guideName}`, import.meta.url), 'utf8')
    const snippet = [...guide.matchAll(/```sh\n([\s\S]*?)```/g)].map((match) => match[1]).find((text) => text.includes('backup_dir='))
    assert.ok(snippet, `${guideName} has an upgrade example`)
    for (const failure of ['', 'stop', 'backup', 'build', 'migrate']) {
      await t.test(`${guideName}: ${failure || 'success'}`, async () => {
        const directory = await mkdtemp(join(tmpdir(), 'temvia-upgrade-guide-'))
        try {
          const home = join(directory, 'private home')
          const project = join(directory, 'project')
          const bin = join(directory, 'bin')
          await Promise.all([home, project, bin].map((path) => mkdir(path)))
          const fakeTool = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const action = tool === 'make' ? (args[0] === 'build' ? 'build' : 'migrate') : (args[1] === 'exec' ? 'backup' : args[1]);
fs.appendFileSync(process.env.CALLS, action + '\\n');
if (action === 'backup') process.stdout.write('test database dump\\n');
if (action === process.env.FAIL_STEP) process.exit(1);
`
          for (const tool of ['docker', 'make']) await writeFile(join(bin, tool), fakeTool, { mode: 0o700 })
          const callsFile = join(directory, 'calls')
          const result = spawnSync('/bin/sh', ['-c', snippet], {
            cwd: project,
            env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, CALLS: callsFile, FAIL_STEP: failure },
            encoding: 'utf8',
            timeout: 15_000,
          })
          assert.equal(result.status, failure ? 1 : 0, result.stderr)
          const actions = (await readFile(callsFile, 'utf8')).trim().split('\n')
          const expected = ['stop', 'backup', 'build', 'migrate', 'up']
          assert.deepEqual(actions, failure ? expected.slice(0, expected.indexOf(failure) + 1) : expected)
          const backupNames = await readdir(home)
          assert.equal(backupNames.length, failure === 'stop' ? 0 : 1)
          if (backupNames.length) {
            const backup = join(home, backupNames[0])
            assert.equal((await stat(backup)).mode & 0o777, 0o700)
            const files = await readdir(backup)
            assert.equal(files.length, 1)
            assert.equal(files[0].endsWith('.partial'), failure === 'backup')
            assert.equal((await stat(join(backup, files[0]))).mode & 0o777, 0o600)
            assert.equal(await readFile(join(backup, files[0]), 'utf8'), 'test database dump\n')
          }
          assert.deepEqual(await readdir(project), [], 'backup must not be placed in the Git project')
        } finally {
          await rm(directory, { recursive: true, force: true })
        }
      })
    }
  }
})

test('generated PostgreSQL readiness allows bounded cold starts without masking failures', async () => {
  const compose = await readFile(new URL('../template/compose.yaml', import.meta.url), 'utf8')
  const postgres = compose.match(/  postgres:\n([\s\S]*?)\n\n  mailpit:/)?.[1]
  assert.ok(postgres, 'generated Compose must define a postgres service')
  assert.match(postgres, /pg_isready -U/, 'readiness must probe PostgreSQL, not return a dummy success')

  const durationMilliseconds = (name) => {
    const match = postgres.match(new RegExp(`^\\s+${name}:\\s+(\\d+)(ms|s|m)$`, 'm'))
    assert.ok(match, `postgres healthcheck must define ${name}`)
    return Number(match[1]) * ({ ms: 1, s: 1_000, m: 60_000 })[match[2]]
  }
  const startPeriod = durationMilliseconds('start_period')
  const interval = durationMilliseconds('interval')
  const timeout = durationMilliseconds('timeout')
  const retriesMatch = postgres.match(/^\s+retries:\s+(\d+)$/m)
  assert.ok(retriesMatch, 'postgres healthcheck must define retries')
  const retries = Number(retriesMatch[1])

  // The observed fresh PostgreSQL 18.6 volume took 72s. Keep enough margin for
  // that legitimate initialization, but bound the grace and failure window.
  assert.ok(startPeriod >= 72_000, 'cold-start grace must cover the observed initialization')
  assert.ok(startPeriod <= 2 * 60_000, 'cold-start grace must remain bounded')
  assert.ok(retries > 0)
  assert.ok(startPeriod + retries * (interval + timeout) <= 5 * 60_000, 'startup grace plus health retries must remain bounded')
  for (const [service, nextService] of [['migrate', 'api'], ['api', 'admin']]) {
    const block = compose.match(new RegExp(`  ${service}:\\n([\\s\\S]*?)\\n\\n  ${nextService}:`))?.[1]
    assert.ok(block, `generated Compose must define ${service}`)
    assert.match(block, /depends_on:\n\s+postgres:\n\s+condition: service_healthy/, `${service} must wait for PostgreSQL health`)
  }
})

test('owned read-only Go module cache cleanup stays inside the temporary root', async (t) => {
  if (typeof process.getuid !== 'function' || process.getuid() === 0) {
    t.skip('requires a non-root filesystem owner to exercise read-only directory removal')
    return
  }
  const temporary = await mkdtemp(join(tmpdir(), 'temvia-go-cache-cleanup-'))
  const moduleCache = join(temporary, 'go-module-cache')
  const moduleDirectory = join(moduleCache, 'cache', 'example.com', 'module@v1.0.0')
  const outside = await mkdtemp(join(tmpdir(), 'temvia-go-cache-outside-'))
  const outsideFile = join(outside, 'must-survive.txt')
  try {
    await mkdir(moduleDirectory, { recursive: true })
    await writeFile(join(moduleDirectory, 'module.go'), 'package module\n')
    await writeFile(outsideFile, 'outside resource\n')
    await chmod(outside, 0o555)
    await symlink(outside, join(moduleCache, 'escape'))
    for (const directory of [moduleCache, join(moduleCache, 'cache'), join(moduleCache, 'cache', 'example.com'), moduleDirectory]) {
      await chmod(directory, 0o555)
    }

    await prepareOwnedGoModuleCacheForCleanup(temporary, moduleCache)
    assert.equal((await stat(moduleDirectory)).mode & 0o700, 0o700, 'only owned cache directories become removable')
    assert.equal((await lstat(join(moduleCache, 'escape'))).isSymbolicLink(), true)
    assert.equal((await stat(outside)).mode & 0o777, 0o555, 'symlink targets are not chmod-ed')
    await cleanupAcceptanceTemporaryDirectory(temporary, moduleCache, 'read-only cache acceptance')

    await assert.rejects(stat(temporary), { code: 'ENOENT' })
    assert.equal(await readFile(outsideFile, 'utf8'), 'outside resource\n', 'cleanup must not follow the cache symlink')
  } finally {
    await chmod(outside, 0o700).catch(() => {})
    await rm(temporary, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('primary and cleanup failures remain distinct and do not announce success', async () => {
  const errors = []
  const logs = []
  const originalError = console.error
  const originalLog = console.log
  console.error = (...values) => errors.push(values.join(' '))
  console.log = (...values) => logs.push(values.join(' '))
  try {
    await assert.rejects(
      runFirstRunAcceptance(join(tmpdir(), 'temvia-missing-release.tgz'), {
        acceptanceLabel: 'cleanup regression',
        cleanupTemporaryDirectory: async (temporary) => {
          await rm(temporary, { recursive: true, force: true })
          throw new Error('simulated cleanup EACCES')
        },
      }),
      (error) => {
        assert.ok(error instanceof AggregateError)
        assert.equal(error.errors.length, 2)
        assert.match(error.errors[0].message, /ENOENT/)
        assert.match(error.errors[1].message, /simulated cleanup EACCES/)
        return true
      },
    )
  } finally {
    console.error = originalError
    console.log = originalLog
  }
  assert.equal(logs.length, 0, 'a failed teardown must not emit a passed message')
  assert.match(errors.join('\n'), /cleanup regression temporary-directory cleanup failed/)
  assert.match(errors.join('\n'), /cleanup regression failed/)
})

test('browser acceptance invokes the pinned local Playwright CLI without pnpm reconciliation', () => {
  const adminDirectory = join(tmpdir(), 'temvia-generated-admin')
  const install = playwrightCLIInvocation(adminDirectory, ['install', 'chromium'])
  assert.equal(install.command, process.execPath)
  assert.deepEqual(install.args, [join(adminDirectory, 'node_modules', '@playwright', 'test', 'cli.js'), 'install', 'chromium'])

  const suite = playwrightCLIInvocation(adminDirectory, ['test', 'e2e/first-run.spec.ts', '--workers=1', '--reporter=json'])
  assert.equal(suite.command, process.execPath)
  assert.equal(suite.args[0], join(adminDirectory, 'node_modules', '@playwright', 'test', 'cli.js'))
  assert.deepEqual(suite.args.slice(1), ['test', 'e2e/first-run.spec.ts', '--workers=1', '--reporter=json'])
  assert.equal(suite.args.includes('exec'), false)
  assert.throws(() => playwrightCLIInvocation(adminDirectory, ['test', 1]), /array of strings/)
})

test('dependency install diagnostics keep useful failures but hide credentials and browser reports', async () => {
  await assert.rejects(
    runCommand(process.execPath, ['-e', 'console.error("dependency download failed: HTTP 503 https://user:private-pass@example.test/archive"); process.exit(1)'], {
      label: 'dependency install fixture',
      secrets: ['private-pass'],
    }),
    (error) => {
      assert.match(error.message, /dependency download failed/)
      assert.match(error.message, /HTTP 503/)
      assert.doesNotMatch(error.message, /private-pass|https:\/\//)
      return true
    },
  )
  await assert.rejects(
    runCommand(process.execPath, ['-e', 'console.error("browser report password=private-pass mail body=secret"); process.exit(1)'], {
      includeOutput: false,
      label: 'browser report fixture',
      secrets: ['private-pass'],
    }),
    (error) => {
      assert.doesNotMatch(error.message, /private-pass|secret/)
      return true
    },
  )
})

test('first-run acceptance isolates inherited deployment and browser routing', async () => {
  const source = {
    PATH: '/tool/bin',
    HTTPS_PROXY: 'http://proxy.example.test:8080',
    GOPROXY: 'https://proxy.golang.example.test,direct',
    POSTGRES_HOST: 'existing-db.example.test',
    POSTGRES_DB: 'existing',
    POSTGRES_PASSWORD: 'do-not-use',
    PGHOST: 'existing-db.example.test',
    COMPOSE_FILE: '/existing/compose.yaml',
    COMPOSE_PROJECT_NAME: 'existing-project',
    APP_PUBLIC_URL: 'https://existing.example.test',
    API_PORT: '443',
    E2E_SETUP_URL: 'https://existing.example.test/setup#token=secret',
    PLAYWRIGHT_BASE_URL: 'https://existing.example.test',
    NPM_CONFIG_PREFIX: '/existing/npm-prefix',
    npm_config_registry: 'https://registry.example.test',
    TEST_POSTGRES_DSN: 'postgres://inherited-secret@example.test/old',
    DOCKER_HOST: 'tcp://inherited-docker.example.test:2376',
    DOCKER_CONTEXT: 'inherited-context',
    NPM_TOKEN: 'publish-secret',
    GITHUB_TOKEN: 'github-secret',
    GIT_DIR: '/inherited/git',
    GIT_TEMPLATE_DIR: '/inherited/templates',
    NODE_OPTIONS: '--require=/inherited/hook.cjs',
    MAKEFLAGS: '--jobs=32',
  }
  const sanitized = sanitizeAcceptanceEnvironment(source)
  assert.equal(sanitized.PATH, source.PATH)
  assert.equal(sanitized.HTTPS_PROXY, source.HTTPS_PROXY)
  assert.equal(sanitized.GOPROXY, source.GOPROXY)
  for (const name of ['POSTGRES_HOST', 'POSTGRES_DB', 'POSTGRES_PASSWORD', 'PGHOST', 'COMPOSE_FILE', 'COMPOSE_PROJECT_NAME', 'APP_PUBLIC_URL', 'API_PORT', 'E2E_SETUP_URL', 'PLAYWRIGHT_BASE_URL', 'NPM_CONFIG_PREFIX', 'npm_config_registry', 'TEST_POSTGRES_DSN', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'NPM_TOKEN', 'GITHUB_TOKEN', 'GIT_DIR', 'GIT_TEMPLATE_DIR', 'NODE_OPTIONS', 'MAKEFLAGS']) {
    assert.equal(sanitized[name], undefined, `inherited ${name} must not survive`)
  }

  const directory = await mkdtemp(join(tmpdir(), 'temvia-acceptance-env-'))
  try {
    const composePath = join(directory, 'compose.yaml')
    await writeFile(composePath, [
      'services:',
      '  postgres:',
      '    image: postgres',
      '    environment:',
      '      POSTGRES_HOST: ${POSTGRES_HOST:-postgres}',
      '      POSTGRES_DB: ${POSTGRES_DB:-temvia}',
      '  api:',
      '    build:',
      '      args:',
      '        GOPROXY: ${GOPROXY:-https://proxy.golang.org,direct}',
      '',
    ].join('\n'))
    await writeFile(join(directory, '.env'), 'POSTGRES_DB=generated\n')
    const composeEnvironment = await createAcceptanceEnvironment(directory, 'generated-project', source)
    assert.equal(composeEnvironment.COMPOSE_FILE, composePath)
    assert.equal(composeEnvironment.COMPOSE_ENV_FILES, join(directory, '.env'))
    assert.equal(composeEnvironment.COMPOSE_PROJECT_NAME, 'generated-project')
    assert.equal(composeEnvironment.GOPROXY, source.GOPROXY)
    for (const name of ['POSTGRES_HOST', 'POSTGRES_DB', 'POSTGRES_PASSWORD', 'COMPOSE_FILE', 'APP_PUBLIC_URL']) {
      if (name === 'COMPOSE_FILE') continue
      assert.equal(composeEnvironment[name], undefined, `Compose override ${name} must come from generated files`)
    }

    const browserEnvironment = createBrowserEnvironment(composeEnvironment, {
      setupURL: 'http://127.0.0.1:1234/setup#token=generated',
      origin: 'http://127.0.0.1:1234',
      email: 'admin@example.com',
      password: 'Admin1!x',
      name: 'Acceptance Admin',
      extraEnvironment: {
        PLAYWRIGHT_BASE_URL: 'https://inherited.example.test',
        COMPOSE_PROJECT_NAME: 'inherited-compose',
        PGHOST: 'inherited-postgres',
        E2E_SETUP_URL: 'https://inherited.example.test/setup#token=inherited',
        E2E_ADMIN_PASSWORD: 'inherited-password',
        E2E_EMAIL_TASKS: '1',
      },
    })
    assert.equal(browserEnvironment.PLAYWRIGHT_BASE_URL, 'http://127.0.0.1:1234')
    assert.equal(browserEnvironment.E2E_SETUP_URL, 'http://127.0.0.1:1234/setup#token=generated')
    assert.equal(browserEnvironment.E2E_ADMIN_PASSWORD, 'Admin1!x')
    assert.equal(browserEnvironment.E2E_EMAIL_TASKS, '1')
    assert.equal(browserEnvironment.HTTPS_PROXY, source.HTTPS_PROXY)
    for (const name of ['COMPOSE_FILE', 'COMPOSE_PROJECT_NAME', 'POSTGRES_DB', 'APP_PUBLIC_URL', 'PLAYWRIGHT_BASE_URL', 'PGHOST']) {
      assert.equal(browserEnvironment[name], name === 'PLAYWRIGHT_BASE_URL' ? 'http://127.0.0.1:1234' : undefined, `browser override ${name} must be isolated`)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
