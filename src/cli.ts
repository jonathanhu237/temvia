#!/usr/bin/env node
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { generate, validateModulePath } from './generate.js';
import type { GenerateResult } from './generate.js';
import { systemGit } from './git.js';
import type { Git } from './git.js';

const help = `Usage: create-temvia <directory> --module <go-module-path>

Generate independent Go api/ and React admin/ applications.

Options:
  --module <path>  Go module, e.g. example.com/my-project/api
  -h, --help       Show this help
  -v, --version    Show the CLI version

Use a new or empty directory. Git is initialized only outside an existing
working tree. No files are staged or committed, no remotes are added, and no
dependencies or services are started.

Module paths use a lowercase domain and ordinary ASCII path segments; /v2
and later major-version suffixes are supported. Schemes, whitespace, dot
segments, reserved names, and gopkg.in paths are not supported.
`;

type Arguments = { kind: 'help' } | { kind: 'version' } | { kind: 'generate'; directory: string; modulePath: string };

export function parseArguments(args: string[]): Arguments {
  const { values, positionals, tokens } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    tokens: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      module: { type: 'string' },
    },
  });
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== 'option') continue;
    if (seen.has(token.name)) throw new Error(`Duplicate option: --${token.name}`);
    seen.add(token.name);
  }
  if (values.help || values.version) {
    if (seen.size !== 1 || positionals.length !== 0) {
      throw new Error('Use --help or --version on its own.');
    }
    return { kind: values.help ? 'help' : 'version' };
  }
  if (positionals.length !== 1 || !positionals[0]?.trim()) {
    throw new Error('Provide exactly one target directory.');
  }
  if (!values.module) throw new Error('Provide the Go module path with --module.');
  validateModulePath(values.module);
  return { kind: 'generate', directory: positionals[0], modulePath: values.module };
}

function quotePath(value: string): string {
  // Single-quoted paths also work in PowerShell; escape its apostrophes separately.
  return process.platform === 'win32'
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", "'\\''")}'`;
}

export function nextSteps(result: GenerateResult): string {
  return `Created ${result.directory}
${result.repository === 'existing' ? 'Using the existing Git working tree; no nested repository created.' : 'Initialized Git; no files staged or committed.'}

Container backend:
  cd ${quotePath(result.directory)}
  cp .env.example .env  # fill POSTGRES_PASSWORD and REDIS_PASSWORD
  make build
  make migrate-up
  make up

API (Go 1.27+):
  cd ${quotePath(join(result.directory, 'api'))}
  go run ./cmd/server

Admin, in another terminal (Node 24+, pnpm 11.24.0):
  cd ${quotePath(join(result.directory, 'admin'))}
  pnpm install
  pnpm dev

API health: http://127.0.0.1:8080/health
Admin: open the URL printed by Vite (default http://127.0.0.1:5173).
If port 5173 is in use, Vite tries the next available port.
Dependencies were not installed. See the generated README.md for more commands.
`;
}

export async function run(args: string[], cwd = process.cwd(), git: Git = systemGit): Promise<string> {
  const options = parseArguments(args);
  if (options.kind === 'help') return help;
  if (options.kind === 'version') {
    const metadata: unknown = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
    if (!metadata || typeof metadata !== 'object' || !('version' in metadata) || typeof metadata.version !== 'string') {
      throw new Error('Package metadata is missing its version.');
    }
    return `${metadata.version}\n`;
  }
  return nextSteps(await generate({ directory: options.directory, modulePath: options.modulePath, cwd }, git));
}

// Resolve npm's bin symlink, without requiring import.meta.main (Node 24.2+).
const entry = process.argv[1];
if (entry && await fs.realpath(entry).catch(() => undefined) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(await run(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\nRun create-temvia --help for usage.\n`);
    process.exitCode = 1;
  }
}
