import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join } from 'node:path';

// This is an independently maintained inventory of the application template.
// It intentionally describes the product we ship rather than treating the
// original create-vite demo as a byte-for-byte oracle.
export const adminTemplateFiles = [
  '.dockerignore', '.oxlintrc.json', 'Caddyfile', 'Dockerfile', 'README.md', 'UPSTREAM.md',
  '_gitignore', 'components.json', 'index.html', 'package.json',
  'playwright.config.ts', 'vite.config.ts', 'vitest.config.ts',
  'tsconfig.app.json', 'tsconfig.json', 'tsconfig.node.json',
  'src/app/context.ts', 'src/app/providers.tsx', 'src/app/query-client.ts', 'src/app/router.tsx',
  'src/components/ui/alert.tsx', 'src/components/ui/button.tsx', 'src/components/ui/card.tsx',
  'src/components/ui/dropdown-menu.tsx', 'src/components/ui/field.tsx', 'src/components/ui/input.tsx',
  'src/components/ui/label.tsx', 'src/components/ui/separator.tsx', 'src/components/ui/sheet.tsx',
  'src/components/ui/sidebar.tsx', 'src/components/ui/skeleton.tsx', 'src/components/ui/sonner.tsx',
  'src/components/ui/tooltip.tsx',
  'src/features/auth/auth-page.test.tsx', 'src/features/auth/auth-page.tsx', 'src/features/auth/authenticated-shell.tsx',
  'src/features/auth/form-fields.tsx', 'src/features/auth/forms.test.tsx',
  'src/features/auth/login-form.tsx', 'src/features/auth/queries.test.ts', 'src/features/auth/queries.ts', 'src/features/auth/schemas.test.ts',
  'src/features/auth/schemas.ts', 'src/features/auth/session-error.tsx', 'src/features/auth/setup-form.tsx',
  'src/hooks/use-mobile.tsx', 'src/index.css', 'src/lib/utils.ts', 'src/main.tsx', 'src/routeTree.gen.ts',
  'src/routes/__root.tsx', 'src/routes/_authenticated.tsx', 'src/routes/_authenticated/index.tsx',
  'src/routes/login.tsx', 'src/routes/setup.tsx',
  'src/shared/api/client.test.ts', 'src/shared/api/client.ts', 'src/shared/api/contracts.ts',
  'src/shared/api/problems.test.ts', 'src/shared/api/problems.ts',
  'src/shared/bootstrap/setup-authority.test.ts', 'src/shared/bootstrap/setup-authority.ts',
  'src/shared/i18n/index.test.ts', 'src/shared/i18n/index.ts', 'src/shared/i18n/resources.ts',
  'src/test/msw.ts', 'src/test/setup.ts',
  'e2e/auth.spec.ts',
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
  'api/internal/auth/adapter/password/argon2id.go', 'api/internal/auth/adapter/password/argon2id_test.go',
  'api/internal/auth/adapter/postgres/store.go', 'api/internal/auth/adapter/postgres/accounts.go',
  'api/internal/auth/adapter/postgres/store_test.go', 'api/internal/auth/adapter/postgres/store_integration_test.go',
  'api/internal/auth/adapter/redis/scripts.go', 'api/internal/auth/adapter/redis/store.go',
  'api/internal/auth/adapter/redis/store_test.go', 'api/internal/auth/adapter/redis/store_integration_test.go',
  'api/internal/auth/adapter/httpapi/problem.go', 'api/internal/auth/adapter/httpapi/json.go',
  'api/internal/auth/adapter/httpapi/routes.go', 'api/internal/auth/adapter/httpapi/response.go',
  'api/internal/auth/adapter/httpapi/httpapi_test.go',
  ...adminTemplateFiles.map((path) => `admin/${path}`),
];

export const upstreamProvenance = {
  package: 'create-vite',
  version: '9.2.0',
  tarballUrl: 'https://registry.npmjs.org/create-vite/-/create-vite-9.2.0.tgz',
  integrity: 'sha512-Fra5Zj1DLdjGn7qG0R33bRq60da4sKjWZjrJIRtpKWJJtQEAhl7vQ3/snPjheqY7Ryzqi3pJsozIG1JRWbG3ig==',
  archiveSha256: 'c370c3eafa839d8b16b51fbf28bf521b5beffab816ee236de5fa7e0c513a2eb4',
  templatePrefix: 'package/template-react-ts/',
};

export function generatedPath(path) {
  return path.replace(/(^|\/)_(gitignore|oxlintrc\.json)$/, '$1.$2');
}

export async function listFiles(directory, prefix = '') {
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

export async function assertAdminBaseline(directory, { materialized = true } = {}) {
  const expected = adminTemplateFiles.map((path) => materialized ? generatedPath(path) : path).sort();
  assert.deepEqual(await listFiles(directory), expected, 'Exact admin application inventory');

  const metadata = JSON.parse(await fs.readFile(join(directory, 'package.json'), 'utf8'));
  assert.equal(metadata.name, 'admin');
  assert.equal(metadata.private, true);
  assert.equal(metadata.version, '0.0.0');
  assert.equal(metadata.type, 'module');
  assert.equal(metadata.engines?.node, '>=24');
  assert.equal(metadata.packageManager, 'pnpm@11.24.0');
  assert.deepEqual(metadata.scripts, {
    dev: 'vite',
    build: 'tsc -b && vite build',
    lint: 'oxlint',
    preview: 'vite preview',
    check: 'tsc -b',
    test: 'vitest run',
    'test:watch': 'vitest',
    'test:e2e': 'playwright test',
  });
  const dependencyVersions = {
    '@hookform/resolvers': '5.9.1', '@radix-ui/react-dialog': '1.1.23',
    '@radix-ui/react-dropdown-menu': '2.1.24', '@radix-ui/react-label': '2.1.15',
    '@radix-ui/react-separator': '1.1.15', '@radix-ui/react-slot': '1.3.3',
    '@radix-ui/react-tooltip': '1.2.16', '@tanstack/react-query': '5.102.8',
    '@tanstack/react-router': '1.170.32', 'class-variance-authority': '0.7.1',
    clsx: '2.1.1', i18next: '26.4.0', 'lucide-react': '1.37.0',
    react: '19.2.8', 'react-dom': '19.2.8', 'react-hook-form': '7.87.0',
    'react-i18next': '17.0.12', sonner: '2.0.8', 'tailwind-merge': '3.6.0',
    tailwindcss: '4.3.3', 'tw-animate-css': '1.4.0', zod: '4.5.4',
  };
  const devDependencyVersions = {
    '@axe-core/playwright': '4.13.0', '@playwright/test': '1.62.1',
    '@tailwindcss/vite': '4.3.3', '@tanstack/router-plugin': '1.168.35',
    '@testing-library/jest-dom': '7.0.1', '@testing-library/react': '16.3.3',
    '@testing-library/user-event': '14.6.6', '@types/node': '24.13.3',
    '@types/react': '19.2.18', '@types/react-dom': '19.2.5',
    '@vitejs/plugin-react': '6.1.1', jsdom: '30.0.1', msw: '2.15.0',
    oxlint: '1.80.0', typescript: '6.0.3', vite: '8.2.2', vitest: '4.1.11',
  };
  assert.deepEqual(metadata.dependencies, dependencyVersions);
  assert.deepEqual(metadata.devDependencies, devDependencyVersions);

  const viteConfig = await fs.readFile(join(directory, 'vite.config.ts'), 'utf8');
  assert.match(viteConfig, /tanstackRouter\(/);
  assert.match(viteConfig, /tailwindcss\(\)/);
  assert.match(viteConfig, /alias:/);
  assert.match(viteConfig, /['"]\/api['"]:/);
  assert.match(viteConfig, /loadEnv\(mode, path\.resolve\(import\.meta\.dirname, ['"]\.\.['"]\), ['"]['"]\)/);
  assert.match(viteConfig, /rootEnvironment\.API_PORT/);
  assert.match(viteConfig, /host: ['"]127\.0\.0\.1['"]/);
  assert.doesNotMatch(viteConfig, /strictPort/);

  const caddyfile = await fs.readFile(join(directory, 'Caddyfile'), 'utf8');
  assert.match(caddyfile, /path \/api \/api\//);
  assert.match(caddyfile, /path \/assets \/assets\//);
  assert.match(caddyfile, /reverse_proxy api:8080/);
  assert.match(caddyfile, /try_files \{path\} \/index\.html/);
  const dockerfile = await fs.readFile(join(directory, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /node:24\.20\.0-alpine/);
  assert.match(dockerfile, /caddy:2\.10\.2-alpine/);
  assert.match(dockerfile, /pnpm build/);
  assert.match(dockerfile, /COPY --from=build \/app\/dist \/srv/);
  assert.match(dockerfile, /USER caddy/);

  const vitestConfig = await fs.readFile(join(directory, 'vitest.config.ts'), 'utf8');
  assert.match(vitestConfig, /--no-experimental-webstorage/);
  assert.match(vitestConfig, /url: ['"]http:\/\/localhost\/['"]/);
  const sidebar = await fs.readFile(join(directory, 'src/components/ui/sidebar.tsx'), 'utf8');
  assert.match(sidebar, /w-\(--sidebar-width\)/);
  assert.doesNotMatch(sidebar, /(?:max-)?w-\[--/);
  const authBrowserTest = await fs.readFile(join(directory, 'e2e/auth.spec.ts'), 'utf8');
  assert.match(authBrowserTest, /headingBox!\.x.*sidebarBox!\.x \+ sidebarBox!\.width/);

  const provenance = await fs.readFile(join(directory, 'UPSTREAM.md'), 'utf8');
  for (const identity of Object.values(upstreamProvenance)) assert.ok(provenance.includes(identity), `Documented upstream identity: ${identity}`);
  assert.match(provenance, /application owns|application replacement|provenance/i);
}
