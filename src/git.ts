import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';

export type RepositoryState = 'existing' | 'new';

export interface Git {
  inspect(directory: string): RepositoryState;
  init(directory: string): void;
}

type GitRunner = (args: string[], directory: string) => SpawnSyncReturns<string>;

function runGit(args: string[], directory: string): SpawnSyncReturns<string> {
  const env: NodeJS.ProcessEnv = { ...process.env, LC_ALL: 'C', GIT_OPTIONAL_LOCKS: '0' };
  // An invocation from a Git hook must still operate on the requested target.
  for (const name of [
    'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_PREFIX',
    'GIT_IMPLICIT_WORK_TREE', 'GIT_CEILING_DIRECTORIES',
    'GIT_DISCOVERY_ACROSS_FILESYSTEM',
  ]) {
    delete env[name];
  }
  return spawnSync('git', args, {
    cwd: directory,
    env,
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
  });
}

function checkProcess(result: SpawnSyncReturns<string>): void {
  if (result.error) {
    if ('code' in result.error && result.error.code === 'ENOENT') {
      throw new Error('Git is required. Install Git and try again.');
    }
    throw new Error(`Could not run Git: ${result.error.message}`);
  }
  if (result.signal || result.status === null) {
    throw new Error(`Git did not finish (${result.signal ?? 'unknown status'}).`);
  }
}

export function createGit(run: GitRunner = runGit): Git {
  return {
    inspect(directory) {
      const result = run(['rev-parse', '--is-inside-work-tree'], directory);
      checkProcess(result);
      if (result.status === 0 && result.stdout.trim() === 'true') {
        return 'existing';
      }
      if (result.status === 0 && result.stdout.trim() === 'false') {
        throw new Error('The target is inside Git metadata or a bare repository. Choose a working-tree directory.');
      }
      // A broken .git pointer also exits 128, but says "not a git repository: ...".
      if (result.status === 128 && /^fatal: not a git repository \(or any /.test(result.stderr)) {
        return 'new';
      }
      throw new Error(`Could not inspect the target's Git repository: ${result.stderr.trim() || `exit ${result.status}`}`);
    },
    init(directory) {
      const result = run(['init', '--quiet'], directory);
      checkProcess(result);
      if (result.status !== 0) {
        throw new Error(result.stderr.trim() || `Git exited with status ${result.status}.`);
      }
    },
  };
}

export const systemGit = createGit();
