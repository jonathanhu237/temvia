import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { parseArguments, run } from '../dist/cli.js';
import { generate, validateModulePath } from '../dist/generate.js';
import { createGit } from '../dist/git.js';
import { cli, contaminateTemplate, fakeGit, modulePath, root, templateContaminants, temporaryDirectory } from './helpers.mjs';
import { adminTemplateFiles, assertAdminBaseline, generatedPath } from './react-ts-baseline.mjs';

test('arguments require one directory and module, reject unsupported options before writes', () => {
  assert.deepEqual(parseArguments(['my project', '--module', modulePath]), {
    kind: 'generate', directory: 'my project', modulePath,
  });
  assert.equal(parseArguments(['--module=' + modulePath, 'project']).kind, 'generate');
  for (const args of [
    [], ['project'], ['--module', modulePath], ['a', 'b', '--module', modulePath],
    ['project', '--force', '--module', modulePath], ['project', '--module'],
    ['project', '--module', modulePath, '--module', modulePath],
    ['--help', '--help'], ['--help', '--version'], ['project', '--help'],
  ]) {
    assert.throws(() => parseArguments(args), undefined, JSON.stringify(args));
  }
});

test('module path subset accepts ordinary repositories and rejects invalid go.mod input', () => {
  for (const path of [modulePath, 'github.com/owner/project/v2', 'git.example.com/team/my_api/v12', 'example.com/Project']) {
    assert.doesNotThrow(() => validateModulePath(path), path);
  }
  for (const path of [
    '', 'local', 'EXAMPLE.com/project', 'https://example.com/project',
    '/example.com/project', 'example.com/project/', 'example.com//project',
    'example.com/../project', 'example.com/.hidden', 'example.com/project.',
    'example.com/my project', 'example.com/project\nrequire evil.example/pkg v1.0.0',
    'example.com\\project', 'example.com/CON', 'example.com/nul.txt',
    'con.example/api', 'lpt1.example/api',
    'example.com/project/v1', 'example.com/project/v0', 'example.com/project/v02',
    'example.com/project/v2.0', 'gopkg.in/yaml.v3',
  ]) {
    assert.throws(() => validateModulePath(path), /Unsupported Go module path/, path);
  }
});

test('help/version work without Git or filesystem output; subprocess errors are nonzero', async (t) => {
  const cwd = await temporaryDirectory(t);
  const git = fakeGit();
  assert.match(await run(['--help'], cwd, git), /Usage: create-temvia/);
  assert.match(await run(['--version'], cwd, git), /^0\.0\.0\n$/);
  assert.deepEqual(git.calls, []);
  for (const flag of ['--help', '--version']) {
    const result = spawnSync(process.execPath, [cli, flag], { cwd, env: { ...process.env, PATH: '' }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.length > 0);
  }
  const invalid = spawnSync(process.execPath, [cli, 'project', '--module', 'bad'], { cwd, encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unsupported Go module path/);
  assert.deepEqual(await fs.readdir(cwd), []);
});

test('new and empty targets produce independent apps and quote paths with spaces/apostrophes', async (t) => {
  const cwd = await temporaryDirectory(t);
  for (const preexisting of [false, true]) {
    const name = preexisting ? 'empty' : "nested/my project's app";
    const target = join(cwd, name);
    if (preexisting) await fs.mkdir(target);
    const git = fakeGit();
    const output = await run([name, '--module', modulePath], cwd, git);
    assert.match(output, /go run .\/cmd\/server/);
    assert.match(output, /pnpm install/);
    assert.match(output, /Dependencies were not installed/);
    assert.deepEqual(await fs.readdir(target), ['.env.example', '.gitignore', 'Makefile', 'README.md', 'admin', 'api', 'compose.yaml'].sort());
    assert.match(await fs.readFile(join(target, 'api/go.mod'), 'utf8'), new RegExp(`^module ${modulePath.replaceAll('/', '\\/')}\\n\\ngo 1\\.27\\.0\\n`));
    assert.equal(JSON.parse(await fs.readFile(join(target, 'admin/package.json'), 'utf8')).name, 'admin');
    assert.deepEqual(git.calls.map(([operation]) => operation), ['inspect', 'init']);
    if (!preexisting && process.platform !== 'win32') assert.ok(output.includes("project'\\''s app/api'"));
  }
});

test('nonempty, file and symlink targets and bad module leave existing bytes unchanged', async (t) => {
  const cwd = await temporaryDirectory(t);
  const occupied = join(cwd, 'occupied');
  await fs.mkdir(occupied);
  await fs.writeFile(join(occupied, 'sentinel'), 'keep me');
  await fs.writeFile(join(cwd, 'file'), 'also keep');
  await fs.symlink(occupied, join(cwd, 'link'), 'dir');
  const git = fakeGit();
  for (const directory of ['occupied', 'file', 'link', '', 'bad\nname']) {
    await assert.rejects(generate({ directory, modulePath, cwd }, git));
  }
  await assert.rejects(generate({ directory: 'new', modulePath: 'invalid', cwd }, git));
  assert.equal(await fs.readFile(join(occupied, 'sentinel'), 'utf8'), 'keep me');
  assert.equal(await fs.readFile(join(cwd, 'file'), 'utf8'), 'also keep');
  assert.deepEqual(await fs.readdir(occupied), ['sentinel']);
  assert.deepEqual(git.calls, []);
});

test('bundled admin preserves the application inventory and documented contracts', async (t) => {
  const cwd = await temporaryDirectory(t);
  await generate({ directory: 'output', modulePath, cwd }, fakeGit());
  const admin = join(cwd, 'output/admin');
  await assertAdminBaseline(admin);
  for (const path of adminTemplateFiles) {
    assert.deepEqual(await fs.readFile(join(admin, generatedPath(path))),
      await fs.readFile(join(root, 'template/admin', path)), `Source bytes preserved: ${path}`);
  }
});

test('generation filters template development artifacts without losing application files or dotfiles', async (t) => {
  const cwd = await temporaryDirectory(t);
  const template = join(cwd, 'template');
  await fs.cp(join(root, 'template'), template, { recursive: true });
  await contaminateTemplate(template);
  await generate({ directory: 'output', modulePath, cwd, templateDirectory: template }, fakeGit());
  const output = join(cwd, 'output');
  await assertAdminBaseline(join(output, 'admin'));
  for (const path of templateContaminants) {
    if (path.endsWith('.gitignore')) continue; // Generated from the inert seeds, not the contaminant.
    await assert.rejects(fs.stat(join(output, path)), { code: 'ENOENT' }, path);
  }
  assert.deepEqual(await fs.readFile(join(output, '.gitignore')), await fs.readFile(join(template, '_gitignore')));
});

test('template preflight rejects missing API, frontend, deployment, lint and provenance files before writes', async (t) => {
  const cwd = await temporaryDirectory(t);
  for (const [index, missing] of [
    'api/go.mod', 'admin/src/shared/api/client.ts', 'admin/Caddyfile',
    'admin/components.json', 'admin/.oxlintrc.json', 'admin/_gitignore', 'admin/UPSTREAM.md',
    'admin/src/routes/-setup.test.ts',
  ].entries()) {
    const template = join(cwd, `template-${index}`);
    await fs.cp(join(root, 'template'), template, { recursive: true });
    await fs.unlink(join(template, missing));
    const target = join(cwd, `incomplete-${index}`);
    const git = fakeGit();
    await assert.rejects(generate({ directory: target, modulePath, templateDirectory: template }, git), {
      message: `Template is incomplete: missing ${generatedPath(missing)}. Reinstall create-temvia.`,
    });
    await assert.rejects(fs.stat(target), { code: 'ENOENT' });
    assert.deepEqual(git.calls, []);
  }
});

test('only the exact _gitignore basename is materialized at every nesting level', async (t) => {
  const cwd = await temporaryDirectory(t);
  const template = join(cwd, 'template');
  await fs.cp(join(root, 'template'), template, { recursive: true });
  const nested = join(template, 'admin/nested');
  await fs.mkdir(nested);
  const extra = { _gitignore: 'nested-ignore\n', '_gitignore.txt': 'keep suffix\n', _notes: 'keep underscore\n' };
  for (const [path, contents] of Object.entries(extra)) await fs.writeFile(join(nested, path), contents);
  await generate({ directory: 'output', modulePath, cwd, templateDirectory: template }, fakeGit());
  const output = join(cwd, 'output');
  for (const path of ['_gitignore', 'admin/_gitignore', 'admin/nested/_gitignore']) {
    assert.deepEqual(await fs.readFile(join(output, generatedPath(path))), await fs.readFile(join(template, path)));
    await assert.rejects(fs.stat(join(output, path)), { code: 'ENOENT' });
  }
  for (const path of ['_gitignore.txt', '_notes']) {
    assert.equal(await fs.readFile(join(output, 'admin/nested', path), 'utf8'), extra[path]);
  }
  await assert.rejects(fs.stat(join(output, 'admin/_oxlintrc.json')), { code: 'ENOENT' });
});

test('write failure removes only owned unchanged files and retains concurrent content', async (t) => {
  const cwd = await temporaryDirectory(t);
  const target = join(cwd, 'output');
  const open = fs.open;
  let writes = 0;
  t.mock.method(fs, 'open', async (path, flags, ...rest) => {
    if (String(path).startsWith(target) && flags === 'wx' && ++writes === 3) {
      await fs.writeFile(join(target, 'concurrent.txt'), 'someone else wrote this');
      await fs.writeFile(join(target, '.gitignore'), 'someone edited this');
      throw new Error('simulated write failure');
    }
    return open(path, flags, ...rest);
  });
  const git = fakeGit();
  await assert.rejects(generate({ directory: target, modulePath }, git), /simulated write failure.*files were retained/);
  assert.equal(await fs.readFile(join(target, 'concurrent.txt'), 'utf8'), 'someone else wrote this');
  assert.equal(await fs.readFile(join(target, '.gitignore'), 'utf8'), 'someone edited this');
  assert.deepEqual(git.calls.map(([operation]) => operation), ['inspect']);
});

test('missing Git fails before writes; init failure preserves generated project', async (t) => {
  const cwd = await temporaryDirectory(t);
  const missing = createGit(() => ({ error: Object.assign(new Error('not found'), { code: 'ENOENT' }) }));
  await assert.rejects(generate({ directory: 'missing-git', modulePath, cwd }, missing), /Git is required/);
  await assert.rejects(fs.stat(join(cwd, 'missing-git')), { code: 'ENOENT' });
  const failing = { ...fakeGit(), init() { throw new Error('permission denied'); } };
  await assert.rejects(generate({ directory: 'retained', modulePath, cwd }, failing), /Git initialization failed.*permission denied.*retained/);
  assert.ok(await fs.stat(join(cwd, 'retained/api/go.mod')));
});

test('Git inspection distinguishes a working tree from expected absence and unexpected failures', () => {
  const result = (status, stdout, stderr = '') => ({ status, stdout, stderr, signal: null });
  assert.equal(createGit(() => result(0, 'true\n')).inspect('/target'), 'existing');
  assert.equal(createGit(() => result(128, '', 'fatal: not a git repository (or any of the parent directories): .git\n')).inspect('/target'), 'new');
  for (const response of [
    result(128, '', 'fatal: detected dubious ownership'),
    result(128, '', 'fatal: invalid gitfile format'),
    result(128, '', 'fatal: not a git repository: /missing/gitdir'),
    result(0, 'false\n'),
    { ...result(null, ''), signal: 'SIGTERM' },
  ]) {
    assert.throws(() => createGit(() => response).inspect('/target'));
  }
});
