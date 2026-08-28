import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { cli, command, gitEnvironment, modulePath, temporaryDirectory } from './helpers.mjs';

async function fixture(t) {
  const directory = await temporaryDirectory(t);
  const env = gitEnvironment(directory);
  await fs.writeFile(env.GIT_CONFIG_GLOBAL, '[init]\n\tdefaultBranch = fixture-default\n');
  const git = (args, cwd = directory) => command('git', args, { cwd, env });
  const invoke = (target, cwd = directory, extraEnv = {}) => command(process.execPath,
    [cli, target, '--module', modulePath], { cwd, env: { ...env, ...extraEnv } });
  return { directory, env, git, invoke };
}

async function repository(f) {
  const repo = join(f.directory, 'repo');
  f.git(['init', '--quiet', repo]);
  await fs.writeFile(join(repo, 'existing.txt'), 'existing content\n');
  f.git(['add', 'existing.txt'], repo);
  f.git(['commit', '--quiet', '-m', 'test: create fixture'], repo);
  return repo;
}

async function snapshot(repo) {
  return Promise.all(['config', 'index', 'HEAD'].map((name) => fs.readFile(join(repo, '.git', name))));
}

test('standalone generation initializes Git respecting default branch, without staging/history/remotes', async (t) => {
  const f = await fixture(t);
  const target = join(f.directory, 'new project');
  assert.match(f.invoke(target), /Initialized Git/);
  assert.equal(f.git(['rev-parse', '--is-inside-work-tree'], target).trim(), 'true');
  assert.equal(f.git(['symbolic-ref', '--short', 'HEAD'], target).trim(), 'fixture-default');
  assert.equal(f.git(['ls-files'], target), '');
  assert.equal(f.git(['remote'], target), '');
  const history = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: target, env: f.env });
  assert.notEqual(history.status, 0);
  assert.match(f.git(['status', '--porcelain'], target), /\?\? admin\//);
});

test('existing working tree retains its index/config/HEAD, including staged and modified files', async (t) => {
  const f = await fixture(t);
  const repo = await repository(f);
  await fs.writeFile(join(repo, 'staged.txt'), 'staged content');
  f.git(['add', 'staged.txt'], repo);
  await fs.writeFile(join(repo, 'existing.txt'), 'modified content');
  f.git(['remote', 'add', 'origin', 'https://example.com/existing.git'], repo);
  const before = await snapshot(repo);
  const head = f.git(['rev-parse', 'HEAD'], repo);
  const target = join(repo, 'applications', 'new app');
  assert.match(f.invoke(target), /Using the existing Git working tree/);
  await assert.rejects(fs.stat(join(target, '.git')), { code: 'ENOENT' });
  assert.deepEqual(await snapshot(repo), before);
  assert.equal(f.git(['rev-parse', 'HEAD'], repo), head);
  assert.equal(f.git(['diff', '--cached', '--name-only'], repo), 'staged.txt\n');
  assert.equal(await fs.readFile(join(repo, 'existing.txt'), 'utf8'), 'modified content');
});

test('linked working tree with a .git file gets no nested repository', async (t) => {
  const f = await fixture(t);
  const repo = await repository(f);
  const worktree = join(f.directory, 'linked worktree');
  f.git(['worktree', 'add', '--quiet', '--detach', worktree, 'HEAD'], repo);
  assert.equal((await fs.stat(join(worktree, '.git'))).isFile(), true);
  const gitfile = await fs.readFile(join(worktree, '.git'));
  const target = join(worktree, 'project');
  assert.match(f.invoke(target), /Using the existing Git working tree/);
  await assert.rejects(fs.stat(join(target, '.git')), { code: 'ENOENT' });
  assert.deepEqual(await fs.readFile(join(worktree, '.git')), gitfile);
  assert.equal(f.git(['diff', '--cached', '--name-only'], worktree), '');
});

test('target outside caller repository is standalone even with inherited Git context', async (t) => {
  const f = await fixture(t);
  const repo = await repository(f);
  const before = await snapshot(repo);
  const target = join(f.directory, 'outside');
  assert.match(f.invoke(target, repo, {
    GIT_DIR: join(repo, '.git'),
    GIT_WORK_TREE: repo,
    GIT_INDEX_FILE: join(repo, '.git/index'),
    GIT_COMMON_DIR: join(repo, '.git'),
    GIT_CEILING_DIRECTORIES: f.directory,
  }), /Initialized Git/);
  assert.equal(f.git(['rev-parse', '--show-toplevel'], target).trim(), target);
  assert.deepEqual(await snapshot(repo), before);
});

test('missing Git, bare repositories, and invalid Git metadata fail without output', async (t) => {
  const f = await fixture(t);
  const absent = join(f.directory, 'missing-git');
  const missing = spawnSync(process.execPath, [cli, absent, '--module', modulePath], {
    cwd: f.directory, env: { ...f.env, PATH: '' }, encoding: 'utf8',
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Git is required/);
  await assert.rejects(fs.stat(absent), { code: 'ENOENT' });

  const bare = join(f.directory, 'bare.git');
  f.git(['init', '--quiet', '--bare', bare]);
  const malformed = join(f.directory, 'malformed');
  await fs.mkdir(malformed);
  await fs.writeFile(join(malformed, '.git'), 'not a Git file');
  const broken = join(f.directory, 'broken');
  const pointer = `gitdir: ${join(f.directory, 'missing-metadata')}\n`;
  await fs.mkdir(broken);
  await fs.writeFile(join(broken, '.git'), pointer);
  for (const directory of [bare, malformed, broken]) {
    const target = join(directory, 'output');
    const result = spawnSync(process.execPath, [cli, target, '--module', modulePath], {
      cwd: f.directory, env: f.env, encoding: 'utf8',
    });
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /bare repository|Could not inspect/);
    await assert.rejects(fs.stat(target), { code: 'ENOENT' });
  }
  assert.equal(await fs.readFile(join(broken, '.git'), 'utf8'), pointer);
});
