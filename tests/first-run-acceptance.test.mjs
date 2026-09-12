import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  createAcceptanceEnvironment,
  createBrowserEnvironment,
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
  }
  const sanitized = sanitizeAcceptanceEnvironment(source)
  assert.equal(sanitized.PATH, source.PATH)
  assert.equal(sanitized.HTTPS_PROXY, source.HTTPS_PROXY)
  assert.equal(sanitized.GOPROXY, source.GOPROXY)
  for (const name of ['POSTGRES_HOST', 'POSTGRES_DB', 'POSTGRES_PASSWORD', 'PGHOST', 'COMPOSE_FILE', 'COMPOSE_PROJECT_NAME', 'APP_PUBLIC_URL', 'API_PORT', 'E2E_SETUP_URL', 'PLAYWRIGHT_BASE_URL', 'NPM_CONFIG_PREFIX', 'npm_config_registry']) {
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
    })
    assert.equal(browserEnvironment.PLAYWRIGHT_BASE_URL, 'http://127.0.0.1:1234')
    assert.equal(browserEnvironment.E2E_SETUP_URL, 'http://127.0.0.1:1234/setup#token=generated')
    assert.equal(browserEnvironment.HTTPS_PROXY, source.HTTPS_PROXY)
    for (const name of ['COMPOSE_FILE', 'COMPOSE_PROJECT_NAME', 'POSTGRES_DB', 'APP_PUBLIC_URL', 'PLAYWRIGHT_BASE_URL']) {
      assert.equal(browserEnvironment[name], name === 'PLAYWRIGHT_BASE_URL' ? 'http://127.0.0.1:1234' : undefined, `browser override ${name} must be isolated`)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
