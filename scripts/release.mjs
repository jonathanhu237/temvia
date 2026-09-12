import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const registry = 'https://registry.npmjs.org';
// The successful manual 0.2.0 release predates source metadata and Git tags.
const bootstrap = { version: '0.2.0', commit: 'a51c9e5b03e3af98d88f85bf89a5a18f09b9a666' };
const run = (command, args, options = {}) => (execFileSync(command, args, { encoding: 'utf8', ...options }) ?? '').trim();
const git = (...args) => run('git', args);

export function releaseType(messages) {
  let result = null;
  for (const message of messages) {
    const subject = message.split('\n')[0];
    if (/^Merge\b/.test(subject)) continue;
    if (/^Revert\b/.test(subject)) { result ??= 'patch'; continue; }
    const match = /^([a-z]+)(?:\([^\r\n()]+\))?(!)?: .+/.exec(subject);
    if (!match) throw new Error(`Use a Conventional Commit title: ${subject}`);
    const [, type, breaking] = match;
    if (!['feat', 'fix', 'perf', 'refactor', 'revert', 'docs', 'test', 'build', 'ci', 'chore', 'style'].includes(type)) {
      throw new Error(`Unsupported commit type: ${type}`);
    }
    if (type === 'feat' || breaking || /^BREAKING[ -]CHANGE:/m.test(message)) result = 'minor';
    else if (['fix', 'perf', 'refactor', 'revert'].includes(type)) result ??= 'patch';
  }
  return result;
}

export function nextVersion(version, type) {
  if (!/^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error(`Expected a stable 0.x.y version: ${version}`);
  const [, minor, patch] = version.split('.').map(Number);
  if (type === 'minor') return `0.${minor + 1}.0`;
  if (type === 'patch') return `0.${minor}.${patch + 1}`;
  if (type === null) return version;
  throw new Error(`Unsupported release type: ${type}`);
}

export function publishedCommit(metadata) {
  const commit = metadata.temviaRelease?.commit ?? (metadata.version === bootstrap.version ? bootstrap.commit : undefined);
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error('Published package has no recognized source commit; refusing to guess a release baseline.');
  return commit;
}

export function matchesPublished(metadata, plan, integrity) {
  return metadata.version === plan.version && publishedCommit(metadata) === plan.commit && metadata.dist?.integrity === integrity;
}

async function latest() {
  const response = await fetch(`${registry}/create-temvia/latest`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}`);
  return response.json();
}

function ancestor(base, head) {
  try { git('merge-base', '--is-ancestor', base, head); return true; }
  catch (error) { if (error.status === 1) return false; throw error; }
}

export function planRelease(published, commit, main, ancestor, messagesSince) {
  const base = publishedCommit(published);
  const plan = { commit, baseCommit: base, baseVersion: published.version, version: published.version, release: false, notes: '' };
  if (main) {
    if (base === commit) {
      // Retry after npm succeeded but tag, release, or smoke verification failed.
      plan.release = true;
    } else if (ancestor(base, commit)) {
      const messages = messagesSince(base, commit);
      const type = releaseType(messages);
      plan.version = nextVersion(published.version, type);
      plan.release = type !== null;
      plan.notes = messages.map(message => `- ${message.split('\n')[0]}`).join('\n');
    } else if (!ancestor(commit, base)) {
      throw new Error('main diverged from the published source; refusing to publish unrelated history.');
    }
    // An older queued push is still built, but cannot replace a newer release.
  }
  return plan;
}

async function prepare() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (pkg.name !== 'create-temvia' || pkg.private || pkg.license !== 'MIT' || pkg.publishConfig?.access !== 'public') throw new Error('Invalid package release metadata');
  const commit = git('rev-parse', 'HEAD');
  const published = await latest();
  const plan = planRelease(published, commit, process.env.GITHUB_REF === 'refs/heads/main', ancestor,
    (base, head) => git('log', '--format=%B%x00', `${base}..${head}`).split('\0').map(s => s.trim()).filter(Boolean));
  if (plan.release) {
    pkg.version = plan.version;
    pkg.temviaRelease = { commit };
    writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
  } else {
    plan.version = pkg.version;
  }
  mkdirSync('.release', { recursive: true });
  writeFileSync('.release/plan.json', `${JSON.stringify(plan, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${plan.version}\nrelease=${plan.release}\n`);
  console.log(JSON.stringify({ version: plan.version, release: plan.release, commit }));
}

async function publish() {
  const plan = JSON.parse(readFileSync('.release/plan.json', 'utf8'));
  if (!plan.release || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Only a planned main release can publish');
  if (git('rev-parse', 'HEAD') !== plan.commit) throw new Error('Release source does not match checkout');
  const tarball = resolve(`.release/create-temvia-${plan.version}.tgz`);
  const bytes = readFileSync(tarball);
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const current = await latest();
  if (current.version === plan.version) {
    if (!matchesPublished(current, plan, integrity)) throw new Error('This npm version already exists with different source or bytes');
    console.log(`npm ${plan.version} already contains the verified artifact; completing release bookkeeping.`);
  } else {
    if (current.version !== plan.baseVersion || publishedCommit(current) !== plan.baseCommit) throw new Error('npm changed since planning; rerun the workflow before publishing');
    run('npm', ['publish', tarball, '--access', 'public', '--provenance=false', '--ignore-scripts'], { stdio: 'inherit' });
  }
  const tag = `v${plan.version}`;
  const remoteTag = git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`);
  if (remoteTag) {
    git('fetch', 'origin', `refs/tags/${tag}:refs/tags/${tag}`);
    if (git('rev-parse', `${tag}^{commit}`) !== plan.commit) throw new Error(`${tag} points to a different source`);
  } else {
    git('tag', tag, plan.commit);
    git('push', 'origin', `refs/tags/${tag}`);
  }
  writeFileSync('.release/notes.md', `${plan.notes || 'Complete publication of the verified package.'}\n\nSource: ${plan.commit}\n\nSHA-256: ${createHash('sha256').update(bytes).digest('hex')}\n`);

}

// Keep creation idempotent without treating network/auth failures as "release absent".
async function finalize() {
  const plan = JSON.parse(readFileSync('.release/plan.json', 'utf8'));
  const tag = `v${plan.version}`;
  const releases = JSON.parse(run('gh', ['api', '--paginate', '--slurp', `repos/${process.env.GITHUB_REPOSITORY}/releases?per_page=100`]));
  if (!releases.flat().some(release => release.tag_name === tag)) {
    run('gh', ['release', 'create', tag, '--verify-tag', '--title', tag, '--notes-file', '.release/notes.md'], { stdio: 'inherit' });
  }
  run('gh', ['release', 'upload', tag, `.release/create-temvia-${plan.version}.tgz`, `.release/create-temvia-${plan.version}.tgz.sha256`, '--clobber'], { stdio: 'inherit' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const command = process.argv[2];
  if (command === 'prepare') await prepare();
  else if (command === 'publish') await publish();
  else if (command === 'finalize') await finalize();
  else throw new Error('Usage: node scripts/release.mjs prepare|publish|finalize');
}
