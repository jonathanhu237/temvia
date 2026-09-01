import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { systemGit } from './git.js';
import type { Git, RepositoryState } from './git.js';

const templateDirectory = fileURLToPath(new URL('../template/', import.meta.url));
const ignoredNames = new Set([
  'node_modules', 'dist', 'dist-ssr', 'bin', 'coverage', 'playwright-report', 'test-results', '.playwright',
  'postgres-data', 'redis-data', '.git', '.gitignore', '.npmignore', '.DS_Store',
  'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock',
  '.mise.local.toml',
]);

interface TemplateFile {
  name: string;
  contents: Buffer;
}

interface CreatedFile extends TemplateFile {
  identity: Stats;
}

export interface GenerateOptions {
  directory: string;
  modulePath: string;
  cwd?: string;
  templateDirectory?: string;
}

export interface GenerateResult {
  directory: string;
  repository: RepositoryState;
}

export function validateModulePath(modulePath: string): void {
  const [host, ...segments] = modulePath.split('/');
  const domain = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
  const segment = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
  const last = segments.at(-1) ?? '';
  if (
    !host || !domain.test(host) || reserved.test(host) || host === 'gopkg.in' ||
    /\s|[\x00-\x1f\x7f]/.test(modulePath) ||
    segments.some((part) => !segment.test(part) || part.endsWith('.') || reserved.test(part)) ||
    (/^v[0-9.]+$/.test(last) && !/^v(?:[2-9]|[1-9][0-9]+)$/.test(last))
  ) {
    throw new Error('Unsupported Go module path. Use a lowercase domain followed by ordinary path segments, such as example.com/my-project/api or github.com/owner/project/v2. Schemes, whitespace, dot segments, reserved names, and gopkg.in paths are not supported.');
  }
}

async function statIfPresent(path: string): Promise<Stats | undefined> {
  try {
    return await fs.lstat(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function checkTarget(path: string): Promise<void> {
  const stat = await statIfPresent(path);
  if (!stat) return;
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`Target must be a new or empty directory, not a file or symlink: ${path}`);
  }
  if ((await fs.readdir(path)).length > 0) {
    throw new Error(`Target is not empty: ${path}. Choose a new or empty directory; no files were changed.`);
  }
}

async function existingAncestor(path: string): Promise<string> {
  let current = path;
  while (!(await statIfPresent(current))) current = dirname(current);
  // Resolve existing parent aliases, including the system's /tmp symlink on macOS.
  const canonical = await fs.realpath(current);
  if (!(await fs.stat(canonical)).isDirectory()) {
    throw new Error(`Target parent is not a directory: ${current}`);
  }
  return current;
}

async function readTemplate(root: string, modulePath: string): Promise<TemplateFile[]> {
  const files: TemplateFile[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (ignoredNames.has(entry.name) || entry.name === '.env' || (/^\.env\./.test(entry.name) && entry.name !== '.env.example') || /\.(?:tsbuildinfo|log|tmp|tgz)$/.test(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        const outputPath = entry.name === '_gitignore' ? join(directory, '.gitignore') : path;
        const name = relative(root, outputPath).split('\\').join('/');
        files.push({ name, contents: await fs.readFile(path) });
      } else {
        throw new Error(`Template contains an unsupported file: ${path}`);
      }
    }
  }
  await visit(root);
  for (const required of [
    '.env.example', '.gitignore', 'Makefile', 'README.md', 'compose.yaml',
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
    'admin/.dockerignore', 'admin/.gitignore', 'admin/.oxlintrc.json',
    'admin/Caddyfile', 'admin/Dockerfile', 'admin/README.md', 'admin/UPSTREAM.md',
    'admin/components.json', 'admin/package.json', 'admin/index.html',
    'admin/playwright.config.ts', 'admin/vite.config.ts', 'admin/vitest.config.ts',
    'admin/tsconfig.json', 'admin/tsconfig.app.json', 'admin/tsconfig.node.json',
    'admin/src/main.tsx', 'admin/src/index.css', 'admin/src/routeTree.gen.ts',
    'admin/src/app/context.ts', 'admin/src/app/providers.tsx', 'admin/src/app/query-client.ts', 'admin/src/app/router.tsx',
    'admin/src/components/ui/alert.tsx', 'admin/src/components/ui/button.tsx', 'admin/src/components/ui/card.tsx',
    'admin/src/components/ui/dropdown-menu.tsx', 'admin/src/components/ui/field.tsx', 'admin/src/components/ui/input.tsx',
    'admin/src/components/ui/label.tsx', 'admin/src/components/ui/separator.tsx', 'admin/src/components/ui/sheet.tsx',
    'admin/src/components/ui/sidebar.tsx', 'admin/src/components/ui/skeleton.tsx', 'admin/src/components/ui/sonner.tsx',
    'admin/src/components/ui/tooltip.tsx',
    'admin/src/features/auth/auth-page.test.tsx', 'admin/src/features/auth/auth-page.tsx', 'admin/src/features/auth/authenticated-shell.tsx',
    'admin/src/features/auth/form-fields.tsx', 'admin/src/features/auth/forms.test.tsx',
    'admin/src/features/auth/login-form.tsx', 'admin/src/features/auth/queries.test.ts', 'admin/src/features/auth/queries.ts', 'admin/src/features/auth/schemas.test.ts',
    'admin/src/features/auth/schemas.ts', 'admin/src/features/auth/session-error.tsx', 'admin/src/features/auth/setup-form.tsx',
    'admin/src/hooks/use-mobile.tsx', 'admin/src/lib/utils.ts',
    'admin/src/routes/-setup.test.ts',
    'admin/src/routes/__root.tsx', 'admin/src/routes/_authenticated.tsx', 'admin/src/routes/_authenticated/index.tsx',
    'admin/src/routes/login.tsx', 'admin/src/routes/setup.tsx',
    'admin/src/shared/api/client.test.ts', 'admin/src/shared/api/client.ts', 'admin/src/shared/api/contracts.ts',
    'admin/src/shared/api/problems.test.ts', 'admin/src/shared/api/problems.ts',
    'admin/src/shared/bootstrap/setup-authority.test.ts', 'admin/src/shared/bootstrap/setup-authority.ts',
    'admin/src/shared/i18n/index.test.ts', 'admin/src/shared/i18n/index.ts', 'admin/src/shared/i18n/resources.ts',
    'admin/src/test/msw.ts', 'admin/src/test/setup.ts', 'admin/e2e/auth.spec.ts',
  ]) {
    if (!files.some((file) => file.name === required)) {
      throw new Error(`Template is incomplete: missing ${required}. Reinstall create-temvia.`);
    }
  }
  const goMod = files.find((file) => file.name === 'api/go.mod')!;
  const seed = goMod.contents.toString('utf8');
  if (!/^module example\.com\/temvia\/api\r?\n/.test(seed)) {
    throw new Error('Template has an unexpected Go module declaration.');
  }
  goMod.contents = Buffer.from(seed.replace(/^module example\.com\/temvia\/api/, `module ${modulePath}`));
  for (const file of files) {
    if (file.name.endsWith('.go')) {
      file.contents = Buffer.from(file.contents.toString('utf8').replaceAll('example.com/temvia/api', modulePath));
    }
  }
  return files;
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function writeProject(target: string, files: TemplateFile[]): Promise<void> {
  const createdFiles: CreatedFile[] = [];
  const createdDirectories: { name: string; identity: Stats }[] = [];
  async function makeDirectory(path: string): Promise<void> {
    const stat = await statIfPresent(path);
    if (stat) {
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Directory changed during generation: ${path}`);
      return;
    }
    await makeDirectory(dirname(path));
    await fs.mkdir(path);
    createdDirectories.push({ name: path, identity: await fs.lstat(path) });
  }
  try {
    await checkTarget(target);
    await makeDirectory(target);
    for (const file of files) {
      const path = join(target, file.name);
      await makeDirectory(dirname(path));
      const handle = await fs.open(path, 'wx');
      try {
        createdFiles.push({ ...file, name: path, identity: await handle.stat() });
        await handle.writeFile(file.contents);
      } finally {
        await handle.close();
      }
    }
  } catch (error) {
    let retained = false;
    // Never recursively delete a target: another process may have added files.
    for (const file of createdFiles.reverse()) {
      try {
        const current = await statIfPresent(file.name);
        if (!current) continue;
        if (sameFile(current, file.identity) && current.isFile() && (await fs.readFile(file.name)).equals(file.contents)) {
          await fs.unlink(file.name);
        } else {
          retained = true;
        }
      } catch {
        retained = true;
      }
    }
    for (const directory of createdDirectories.reverse()) {
      try {
        const current = await statIfPresent(directory.name);
        if (current && sameFile(current, directory.identity) && current.isDirectory()) {
          await fs.rmdir(directory.name);
        } else if (current) {
          retained = true;
        }
      } catch {
        retained = true;
      }
    }
    throw new Error(`Could not generate project: ${error instanceof Error ? error.message : String(error)}${retained ? ` Some files were retained at ${target}; inspect them before retrying.` : ''}`);
  }
}

export async function generate(options: GenerateOptions, git: Git = systemGit): Promise<GenerateResult> {
  validateModulePath(options.modulePath);
  if (!options.directory.trim() || /[\x00-\x1f\x7f]/.test(options.directory)) {
    throw new Error('Target directory must be nonempty and contain no control characters.');
  }
  const requested = resolve(options.cwd ?? process.cwd(), options.directory);
  await checkTarget(requested);
  const ancestor = await existingAncestor(requested);
  const target = resolve(await fs.realpath(ancestor), relative(ancestor, requested));
  const files = await readTemplate(options.templateDirectory ?? templateDirectory, options.modulePath);
  const repository = git.inspect(ancestor);
  await writeProject(target, files);
  if (repository === 'new') {
    try {
      git.init(target);
    } catch (error) {
      throw new Error(`Project files were generated at ${target}, but Git initialization failed: ${error instanceof Error ? error.message : String(error)} Enter that directory and run git init to retry. The files were retained.`);
    }
  }
  return { directory: target, repository };
}
