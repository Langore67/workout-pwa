import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function safeGit(repoRoot, args, fallback = 'unknown') {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch {
    return fallback;
  }
}

export function formatBuildInfo({ version, commit, branch, builtAt, dirty }) {
  return {
    version: `v${String(version).replace(/^v/, '')}`,
    commit: String(commit),
    displayCommit: dirty ? `${commit} + local changes` : String(commit),
    branch: String(branch),
    builtAt: String(builtAt),
    dirty: Boolean(dirty),
  };
}

export function collectBuildInfo(repoRoot = process.cwd()) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const commit = safeGit(repoRoot, ['rev-parse', '--short', 'HEAD']);
  const branch = safeGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const status = safeGit(repoRoot, [
    'status',
    '--porcelain',
    '--untracked-files=normal',
    '--',
    '.',
  ], '');

  return formatBuildInfo({
    version: packageJson.version || '0.0.0',
    commit,
    branch,
    builtAt: new Date().toISOString(),
    dirty: status.length > 0,
  });
}
