import { execa } from 'execa';
import type { GitHubPrViewJson } from '@shared/types';

const GH_FIELDS =
  'title,body,author,baseRefName,headRefName,baseRefOid,headRefOid,additions,deletions,changedFiles';

export async function ingestGithub(
  numberOrUrl: string
): Promise<{ meta: GitHubPrViewJson; diffText: string }> {
  const id = String(numberOrUrl);
  try {
    const [metaRaw, diffRaw] = await Promise.all([
      execa('gh', ['pr', 'view', id, '--json', GH_FIELDS]),
      execa('gh', ['pr', 'diff', id]),
    ]);
    const meta = JSON.parse(metaRaw.stdout) as GitHubPrViewJson;
    return { meta, diffText: diffRaw.stdout };
  } catch (err) {
    throw mapGhError(err);
  }
}

/**
 * Cheap head-SHA lookup for Phase 2 stale-diff detection. Uses the same `gh pr view` path
 * as `ingestGithub` but requests only the `headRefOid` field — no diff fetched.
 * Throws on any gh CLI error (FAIL CLOSED per Pitfall F).
 */
export async function fetchCurrentHeadSha(numberOrUrl: string): Promise<string> {
  const id = String(numberOrUrl);
  try {
    const { stdout } = await execa('gh', ['pr', 'view', id, '--json', 'headRefOid']);
    const parsed = JSON.parse(stdout) as { headRefOid: string };
    if (typeof parsed.headRefOid !== 'string' || parsed.headRefOid.length === 0) {
      throw new Error('gh returned no headRefOid');
    }
    return parsed.headRefOid;
  } catch (err) {
    throw mapGhError(err);
  }
}

function mapGhError(err: unknown): Error {
  if (err instanceof Error) {
    const raw = err as Error & { stderr?: unknown };
    const stderr = typeof raw.stderr === 'string' ? raw.stderr : '';
    if (stderr.includes('gh auth login') || stderr.includes('authentication')) {
      return new Error("gh CLI is not authenticated. Run 'gh auth login' and try again.");
    }
    if (stderr.includes('no default repository')) {
      return new Error(
        "Couldn't infer repo from current directory. Pass the full PR URL instead."
      );
    }
    return new Error(`gh CLI failed: ${err.message}`);
  }
  return new Error('gh CLI failed');
}
