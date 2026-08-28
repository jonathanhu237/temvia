import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { command, gitEnvironment, modulePath, root, temporaryDirectory } from './helpers.mjs';

const requiredAssets = [
  'template/_gitignore', 'template/README.md', 'template/api/go.mod',
  'template/api/cmd/server/main.go', 'template/api/cmd/server/main_test.go',
  'template/admin/package.json', 'template/admin/index.html',
  'template/admin/vite.config.ts', 'template/admin/tsconfig.json',
  'template/admin/tsconfig.app.json', 'template/admin/tsconfig.node.json',
  'template/admin/src/main.tsx', 'template/admin/src/App.tsx', 'template/admin/src/style.css',
];

function pack(source, destination) {
  const [packed] = JSON.parse(command('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', destination], { cwd: source }));
  return { path: join(destination, packed.filename), files: packed.files.map((file) => file.path) };
}

test('actual npm tarball installs without dev dependencies and its mapped bin generates away from source', async (t) => {
  const directory = await temporaryDirectory(t);
  const packed = pack(root, directory);
  for (const asset of ['dist/cli.js', 'dist/generate.js', 'dist/git.js', ...requiredAssets]) {
    assert.ok(packed.files.includes(asset), `Missing packed asset: ${asset}`);
  }
  for (const file of packed.files) {
    assert.doesNotMatch(file, /(^|\/)(node_modules|\.git|\.env[^/]*|\.trellis|tests)(\/|$)|\.tsbuildinfo$|lock\.yaml$/);
    assert.ok(!file.startsWith('src/'), 'CLI TypeScript should not be needed at runtime');
  }

  const consumer = join(directory, 'consumer');
  await fs.mkdir(consumer);
  await fs.writeFile(join(consumer, 'package.json'), '{"private":true}');
  const env = gitEnvironment(directory);
  command('npm', ['install', '--offline', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false', packed.path], { cwd: consumer, env });
  const installed = join(consumer, 'node_modules/create-temvia');
  const metadata = JSON.parse(await fs.readFile(join(installed, 'package.json'), 'utf8'));
  assert.deepEqual(metadata.bin, { 'create-temvia': 'dist/cli.js' });
  assert.equal(metadata.dependencies, undefined);
  assert.equal(metadata.private, true);
  await assert.rejects(fs.stat(join(consumer, 'node_modules/typescript')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(join(installed, 'node_modules')), { code: 'ENOENT' });
  assert.match(await fs.readFile(join(installed, 'dist/cli.js'), 'utf8'), /^#!\/usr\/bin\/env node\n/);
  assert.equal(command(process.execPath, [join(installed, 'dist/cli.js'), '--version'], { cwd: directory, env }).trim(), metadata.version);

  const output = join(directory, 'generated project');
  const stdout = command('npm', ['exec', '--offline', '--no', '--', 'create-temvia', output, '--module', modulePath], { cwd: consumer, env });
  assert.match(stdout, /Initialized Git/);
  assert.deepEqual((await fs.readdir(output)).sort(), ['.git', '.gitignore', 'README.md', 'admin', 'api']);
  assert.equal(await fs.readFile(join(output, 'api/go.mod'), 'utf8'), `module ${modulePath}\n\ngo 1.27.0\n`);
  for (const asset of requiredAssets) {
    const relative = asset.slice('template/'.length);
    const generated = join(output, relative === '_gitignore' ? '.gitignore' : relative);
    assert.equal((await fs.stat(generated)).isFile(), true, `Missing generated file: ${relative}`);
  }
  assert.equal(command('git', ['ls-files'], { cwd: output, env }), '');
  for (const unwanted of ['package.json', 'pnpm-workspace.yaml', 'web', 'admin/node_modules', 'admin/pnpm-lock.yaml', '_gitignore', '.npmignore']) {
    await assert.rejects(fs.stat(join(output, unwanted)), { code: 'ENOENT' });
  }
});

test('npm packing excludes local template installs, build output, secrets and tool state', async (t) => {
  const directory = await temporaryDirectory(t);
  const stage = join(directory, 'stage');
  await fs.mkdir(stage);
  await fs.copyFile(join(root, 'package.json'), join(stage, 'package.json'));
  await fs.cp(join(root, 'dist'), join(stage, 'dist'), { recursive: true });
  await fs.cp(join(root, 'template'), join(stage, 'template'), { recursive: true });
  const contaminants = [
    'admin/node_modules/local/package.json', 'admin/dist/index.html', 'api/bin/server',
    '.git/config', 'admin/.env', 'admin/.env.local', 'admin/pnpm-lock.yaml',
    'admin/pnpm-workspace.yaml', 'admin/package-lock.json', 'admin/npm-shrinkwrap.json',
    'admin/yarn.lock', 'admin/tsconfig.tsbuildinfo', 'admin/debug.log', 'admin/temp.tmp',
    'admin/archive.tgz', 'admin/.DS_Store', 'admin/.mise.local.toml',
  ];
  for (const path of contaminants) {
    await fs.mkdir(join(stage, 'template', path, '..'), { recursive: true });
    await fs.writeFile(join(stage, 'template', path), 'must not be packed');
  }
  const packed = pack(stage, directory);
  for (const asset of requiredAssets) assert.ok(packed.files.includes(asset), asset);
  for (const path of contaminants) assert.ok(!packed.files.includes(`template/${path}`), path);
});
