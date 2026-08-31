import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const cli = join(root, 'dist/cli.js');
export const modulePath = 'example.com/my-project/api';

// Exercise the same development pollution at both copy and npm-pack boundaries.
export const templateContaminants = [
  'admin/node_modules/local/package.json', 'admin/dist/index.html',
  'admin/dist-ssr/index.js', 'api/bin/server', '.git/config', '.gitignore',
  'admin/.gitignore', 'admin/.npmignore', 'admin/.env', 'admin/.env.local',
  'admin/playwright-report/index.html', 'admin/test-results/run.txt', 'admin/coverage/coverage-final.json',
  'admin/pnpm-lock.yaml', 'admin/pnpm-workspace.yaml', 'admin/package-lock.json',
  'admin/npm-shrinkwrap.json', 'admin/yarn.lock', 'admin/tsconfig.tsbuildinfo',
  'admin/debug.log', 'admin/temp.tmp', 'admin/archive.tgz', 'admin/.DS_Store',
  'admin/.mise.local.toml',
  '.env', '.env.local', 'api/.env', 'api/.env.production',
  'postgres-data/PG_VERSION', 'redis-data/dump.rdb',
];

export async function contaminateTemplate(directory) {
  for (const path of templateContaminants) {
    await fs.mkdir(join(directory, path, '..'), { recursive: true });
    await fs.writeFile(join(directory, path), 'must not ship');
  }
}

export async function temporaryDirectory(t) {
  const directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'temvia-test-')));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

export function fakeGit(state = 'new') {
  const calls = [];
  return {
    calls,
    inspect(directory) { calls.push(['inspect', directory]); return state; },
    init(directory) { calls.push(['init', directory]); },
  };
}

export function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: 60_000,
    ...options,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${executable} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

export function gitEnvironment(directory) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.startsWith('GIT_')) delete env[name];
  }
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(directory, 'global-gitconfig'),
    GIT_AUTHOR_NAME: 'Temvia Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Temvia Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
}
