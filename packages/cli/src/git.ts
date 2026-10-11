import { execFileSync } from 'node:child_process';

function git(...args: string[]): string | null {
  try {
    return (
      execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() ||
      null
    );
  } catch {
    return null;
  }
}

/** Commit and branch for the eval run. In GitHub Actions PRs the checkout is detached, so env vars win. */
export function gitInfo(): { sha: string | null; branch: string | null } {
  const env = process.env;
  return {
    sha: env.GITHUB_SHA ?? git('rev-parse', 'HEAD'),
    branch: env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || git('rev-parse', '--abbrev-ref', 'HEAD'),
  };
}
