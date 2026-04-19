import { execa } from 'execa';
import type { GitHubPrViewJson } from '@shared/types';

// `gh pr view --json` does NOT expose `baseRefOid` (only `headRefOid`). We fetch everything else
// here and use the REST API in `fetchBaseRefOid` to resolve the base SHA separately.
const GH_FIELDS =
  'title,body,author,baseRefName,headRefName,headRefOid,additions,deletions,changedFiles,number';

export async function ingestGithub(
  numberOrUrl: string
): Promise<{ meta: GitHubPrViewJson; diffText: string }> {
  const id = String(numberOrUrl);
  try {
    const [metaRaw, diffRaw] = await Promise.all([
      execa('gh', ['pr', 'view', id, '--json', GH_FIELDS]),
      execa('gh', ['pr', 'diff', id]),
    ]);
    const metaPartial = JSON.parse(metaRaw.stdout) as Omit<GitHubPrViewJson, 'baseRefOid'> & {
      number: number;
    };
    const baseRefOid = await fetchBaseRefOid(id, metaPartial.number);
    const { number: _n, ...rest } = metaPartial;
    const meta: GitHubPrViewJson = { ...rest, baseRefOid };
    return { meta, diffText: diffRaw.stdout };
  } catch (err) {
    throw mapGhError(err);
  }
}

/**
 * Resolve the PR's base SHA via the REST API because `gh pr view --json` omits `baseRefOid`.
 *
 * Strategy:
 * - If `numberOrUrl` is a GitHub PR URL, extract owner/repo directly from it.
 * - Otherwise resolve owner/repo from the cwd's default via `gh repo view --json owner,name`.
 *
 * Throws on any resolution/API error (FAIL CLOSED — matches the rest of the ingest contract).
 */
async function fetchBaseRefOid(numberOrUrl: string, prNumber: number): Promise<string> {
  const urlMatch = numberOrUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/pull\/\d+/);
  let owner: string;
  let repo: string;
  if (urlMatch) {
    owner = urlMatch[1]!;
    repo = urlMatch[2]!;
  } else {
    const { stdout } = await execa('gh', ['repo', 'view', '--json', 'owner,name']);
    const parsed = JSON.parse(stdout) as { owner: { login: string }; name: string };
    owner = parsed.owner.login;
    repo = parsed.name;
  }
  const { stdout } = await execa('gh', [
    'api',
    `repos/${owner}/${repo}/pulls/${prNumber}`,
    '--jq',
    '.base.sha',
  ]);
  const sha = stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`gh api returned invalid base.sha: ${JSON.stringify(sha)}`);
  }
  return sha;
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
