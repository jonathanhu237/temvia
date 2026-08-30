import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { join } from 'node:path';

// This independently verified upstream inventory is deliberately separate from
// the generator's completeness list and never requires network access.
export const baseline = JSON.parse(await fs.readFile(new URL('./fixtures/react-ts-baseline.json', import.meta.url), 'utf8'));
export const adminTemplateFiles = [
  ...baseline.files.map(({ path }) => baseline.templateRenames[path] ?? path),
  ...baseline.addedFiles,
];
export const requiredTemplateFiles = [
  '_gitignore', '.env.example', 'Makefile', 'README.md', 'compose.yaml',
  'api/Dockerfile', 'api/go.mod', 'api/go.sum', 'api/cmd/server/main.go',
  'api/cmd/server/main_test.go', 'api/migrations/Dockerfile',
  'api/migrations/000001_auth.up.sql', 'api/migrations/000001_auth.down.sql', 'api/migrations/migrate-entrypoint.sh',
  'api/internal/config/config.go', 'api/internal/config/config_test.go',
  'api/internal/auth/domain/credentials.go', 'api/internal/auth/domain/credentials_test.go',
  'api/internal/auth/domain/user.go', 'api/internal/auth/application/errors.go',
  'api/internal/auth/application/ports.go', 'api/internal/auth/application/setup.go',
  'api/internal/auth/application/authentication.go', 'api/internal/auth/application/application_test.go',
  'api/internal/auth/adapter/password/argon2id.go',
  'api/internal/auth/adapter/password/argon2id_test.go',
  'api/internal/auth/adapter/postgres/store.go', 'api/internal/auth/adapter/postgres/accounts.go',
  'api/internal/auth/adapter/postgres/store_test.go', 'api/internal/auth/adapter/postgres/store_integration_test.go',
  'api/internal/auth/adapter/redis/scripts.go', 'api/internal/auth/adapter/redis/store.go',
  'api/internal/auth/adapter/redis/store_test.go', 'api/internal/auth/adapter/redis/store_integration_test.go',
  'api/internal/auth/adapter/httpapi/problem.go', 'api/internal/auth/adapter/httpapi/json.go',
  'api/internal/auth/adapter/httpapi/routes.go', 'api/internal/auth/adapter/httpapi/response.go',
  'api/internal/auth/adapter/httpapi/httpapi_test.go',
  ...adminTemplateFiles.map((path) => `admin/${path}`),
];

export function generatedPath(path) {
  return path.replace(/(^|\/)_gitignore$/, '$1.gitignore');
}

async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) {
      files.push(...await listFiles(join(directory, entry.name), path + '/'));
    } else {
      assert.ok(entry.isFile(), `Unexpected non-file: ${path}`);
      files.push(path);
    }
  }
  return files.sort();
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

export async function assertAdminBaseline(directory, { materialized = true } = {}) {
  assert.equal(baseline.files.length, 18);
  assert.deepEqual(baseline.customizedFiles, ['package.json', 'vite.config.ts']);
  assert.deepEqual(baseline.addedFiles, ['UPSTREAM.md']);
  const renames = materialized ? baseline.initializerRenames : baseline.templateRenames;
  const expected = [...baseline.files.map(({ path }) => renames[path] ?? path), ...baseline.addedFiles];
  assert.deepEqual(await listFiles(directory), expected.sort(), 'Exact admin source inventory');
  for (const file of baseline.files) {
    if (baseline.customizedFiles.includes(file.path)) continue;
    const path = renames[file.path] ?? file.path;
    const contents = await fs.readFile(join(directory, path));
    assert.equal(contents.length, file.bytes, `Upstream byte length: ${path}`);
    assert.equal(sha256(contents), file.sha256, `Upstream SHA-256: ${path}`);
  }

  const metadata = JSON.parse(await fs.readFile(join(directory, 'package.json'), 'utf8'));
  assert.deepEqual(metadata, {
    name: 'admin',
    private: true,
    version: '0.0.0',
    type: 'module',
    engines: { node: '>=24' },
    packageManager: 'pnpm@11.24.0',
    scripts: {
      dev: 'vite',
      build: 'tsc -b && vite build',
      lint: 'oxlint',
      preview: 'vite preview',
      check: 'tsc -b',
    },
    dependencies: { react: '19.2.8', 'react-dom': '19.2.8' },
    devDependencies: {
      '@types/node': '24.13.3',
      '@types/react': '19.2.18',
      '@types/react-dom': '19.2.5',
      '@vitejs/plugin-react': '6.1.1',
      oxlint: '1.80.0',
      typescript: '6.0.3',
      vite: '8.2.2',
    },
  });

  const viteConfig = await fs.readFile(join(directory, 'vite.config.ts'), 'utf8');
  const listener = "  server: {\n    host: '127.0.0.1',\n    port: 5173,\n  },\n";
  assert.ok(viteConfig.includes(listener), 'Documented listener customization');
  assert.equal(sha256(viteConfig.replace(listener, '')), baseline.files.find(({ path }) => path === 'vite.config.ts').sha256,
    'No Vite config changes beyond the listener');

  const provenance = await fs.readFile(join(directory, 'UPSTREAM.md'), 'utf8');
  for (const identity of [baseline.tarballUrl, baseline.templatePrefix, baseline.integrity, baseline.archiveSha256]) {
    assert.ok(provenance.includes(identity), `Documented upstream identity: ${identity}`);
  }
  const notice = provenance.match(/```text\n([\s\S]*?)```/)?.[1];
  assert.ok(notice, 'Template-specific upstream notice');
  assert.equal(Buffer.byteLength(notice), baseline.templateLicense.noticeBytes);
  assert.equal(sha256(notice), baseline.templateLicense.noticeSha256, 'Exact upstream CC0 section');
}
