import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseType, nextVersion, publishedCommit, matchesPublished, planRelease } from '../scripts/release.mjs';

test('new features take precedence across the entire unpublished range', () => {
  for (const messages of [['fix: bug', 'feat(auth): passwords'], ['feat: feature', 'fix: bug'], ['feat: one', 'feat: two']]) {
    assert.equal(nextVersion('0.2.3', releaseType(messages)), '0.3.0');
  }
});
test('fixes, performance changes and refactors create one patch release', () => {
  assert.equal(nextVersion('0.2.3', releaseType(['fix(admin): spacing', 'fix: validation'])), '0.2.4');
  for (const type of ['perf', 'refactor', 'revert']) assert.equal(releaseType([`${type}: maintenance`]), 'patch');
});
test('breaking changes stay within the requested 0.x version policy', () => {
  for (const message of ['fix!: incompatible fix', 'refactor(api)!: remove field', 'chore: migrate\n\nBREAKING CHANGE: changed configuration', 'fix: schema\n\nBREAKING-CHANGE: removed field']) {
    assert.equal(nextVersion('0.9.4', releaseType([message])), '0.10.0');
  }
});
test('documentation and infrastructure changes do not publish on their own', () => {
  assert.equal(releaseType(['docs: guide', 'test: coverage', 'ci: releases', 'build: tools', 'chore: maintenance', 'style: formatting', 'Merge branch main']), null);
  assert.equal(nextVersion('0.2.3', null), '0.2.3');
  assert.equal(releaseType([]), null);
});
test('invalid titles and versions fail rather than inventing a release', () => {
  for (const message of ['stuff', 'feat missing colon', 'unknown: change']) assert.throws(() => releaseType([message]));
  for (const version of ['1.0.0', '0.2.0-beta.1', '0.02.0', '0.2']) assert.throws(() => nextVersion(version, 'minor'));
});
test('the manual release baseline is explicit and subsequent sources are recorded', () => {
  assert.equal(publishedCommit({ version: '0.2.0' }), 'a51c9e5b03e3af98d88f85bf89a5a18f09b9a666');
  assert.equal(publishedCommit({ version: '0.3.0', temviaRelease: { commit: 'a'.repeat(40) } }), 'a'.repeat(40));
  assert.throws(() => publishedCommit({ version: '0.3.0' }));
});
test('retry accepts only the same version, source and published bytes', () => {
  const plan = { version: '0.3.0', commit: 'a'.repeat(40) };
  const metadata = { version: plan.version, temviaRelease: { commit: plan.commit }, dist: { integrity: 'sha512-test' } };
  assert.equal(matchesPublished(metadata, plan, 'sha512-test'), true);
  assert.equal(matchesPublished(metadata, plan, 'sha512-different'), false);
  assert.equal(matchesPublished(metadata, { ...plan, commit: 'b'.repeat(40) }, 'sha512-test'), false);
  assert.equal(matchesPublished(metadata, { ...plan, version: '0.3.1' }, 'sha512-test'), false);
});

test('planning includes unpublished changes and never publishes an older or unrelated source', () => {
  const base = 'a'.repeat(40), head = 'b'.repeat(40);
  const published = { version: '0.2.3', temviaRelease: { commit: base } };
  const messages = (from, to) => { assert.equal(from, base); assert.equal(to, head); return ['feat: new capability', 'fix: latest push']; };
  const plan = planRelease(published, head, true, (a, b) => a === base && b === head, messages);
  assert.equal(plan.version, '0.3.0');
  assert.equal(plan.release, true);
  assert.equal(planRelease(published, head, true, (a, b) => a === head && b === base, messages).release, false);
  assert.throws(() => planRelease(published, head, true, () => false, messages), /diverged/);
  assert.equal(planRelease(published, head, false, () => false, messages).release, false);
});
test('rerunning an already published source resumes bookkeeping without another version bump', () => {
  const commit = 'a'.repeat(40);
  const plan = planRelease({ version: '0.3.0', temviaRelease: { commit } }, commit, true, () => { throw Error('unexpected ancestry lookup'); }, () => []);
  assert.equal(plan.version, '0.3.0');
  assert.equal(plan.release, true);
});

// Exercise the actual publication commands without accessing npm or GitHub.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('publication uses the tested artifact and can resume after npm without publishing twice', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'temvia-release-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bin = join(directory, 'bin');
  await mkdir(bin);
  await mkdir(join(directory, '.release'));
  const commit = 'b'.repeat(40);
  const plan = { release: true, version: '0.3.0', commit, baseVersion: '0.2.0', baseCommit: publishedCommit({ version: '0.2.0' }), notes: '- feat: example' };
  const artifact = Buffer.from('verified tarball fixture');
  await writeFile(join(directory, '.release/plan.json'), JSON.stringify(plan));
  await writeFile(join(directory, '.release/create-temvia-0.3.0.tgz'), artifact);
  await writeFile(join(directory, '.release/create-temvia-0.3.0.tgz.sha256'), 'fixture checksum');
  for (const command of ['git', 'npm', 'gh']) {
    await writeFile(join(bin, command), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync('calls.jsonl', JSON.stringify({command:${JSON.stringify(command)},args})+'\\n');
if (${JSON.stringify(command)} === 'git' && args[0] === 'rev-parse') console.log(${JSON.stringify(commit)});
if (${JSON.stringify(command)} === 'gh' && args[0] === 'api') console.log('[[]]');
`, { mode: 0o755 });
  }
  const script = fileURLToPath(new URL('../scripts/release.mjs', import.meta.url));
  const env = { ...process.env, PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}`, GITHUB_REF: 'refs/heads/main', GITHUB_REPOSITORY: 'example/temvia' };
  const invoke = (command, metadata) => spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(`globalThis.fetch = async () => ({ok:true,json:async()=>(${JSON.stringify(metadata)})});`)}`, script, command], { cwd: directory, env, encoding: 'utf8' });
  let result = invoke('publish', { version: '0.2.0' });
  assert.equal(result.status, 0, result.stderr);
  let calls = (await readFile(join(directory, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  const npm = calls.find(call => call.command === 'npm');
  assert.equal(npm.args[0], 'publish');
  assert.equal(npm.args[1], join(directory, '.release/create-temvia-0.3.0.tgz'));
  assert.ok(calls.some(call => call.command === 'git' && call.args[0] === 'push'));
  result = invoke('finalize', {});
  assert.equal(result.status, 0, result.stderr);
  await writeFile(join(directory, 'calls.jsonl'), '');
  const published = { version: '0.3.0', temviaRelease: { commit }, dist: { integrity: `sha512-${createHash('sha512').update(artifact).digest('base64')}` } };
  result = invoke('publish', published);
  assert.equal(result.status, 0, result.stderr);
  calls = (await readFile(join(directory, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(!calls.some(call => call.command === 'npm'));
  await writeFile(join(directory, 'calls.jsonl'), '');
  result = invoke('publish', { ...published, dist: { integrity: 'different bytes' } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /different source or bytes/);
  assert.ok(!(await readFile(join(directory, 'calls.jsonl'), 'utf8')).includes('"npm"'));
});
