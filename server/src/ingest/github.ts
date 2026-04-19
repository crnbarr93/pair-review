import { execa } from 'execa';
import type {
  GitHubPrViewJson,
  ReadOnlyComment,
  DiffModel,
  LineSide,
} from '@shared/types';
import { logger } from '../logger.js';

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

// ---------------------------------------------------------------------------
// Phase 3 — fetchExistingComments + resolveCommentAnchor
// ---------------------------------------------------------------------------

// Internal shape of a single inline review comment from
// `gh api /repos/{owner}/{repo}/pulls/{n}/comments`. NOT exported.
interface GhInlineComment {
  id: number;
  path: string;
  line: number | null;
  original_line: number;
  side: 'LEFT' | 'RIGHT';
  user: { login: string };
  body: string;
  created_at: string;
  html_url: string;
  in_reply_to_id: number | null;
}

/**
 * Resolve a GitHub inline comment to a DiffLine.id in the current diff model.
 * Returns null when the path is not in the diff or no matching line is found
 * (orphan — force-push drift; hidden per D-22).
 *
 * Pitfall 12: context lines (side=BOTH) are valid targets for existing
 * comments. A LEFT-side comment on a context line still resolves.
 *
 * Exported as a pure function so Plan 03-02b's manager extension + Plan 03-03's
 * render test can exercise it independently of execa.
 */
export function resolveCommentAnchor(
  comment: GhInlineComment,
  diffModel: DiffModel
): string | null {
  const file = diffModel.files.find((f) => f.path === comment.path);
  if (!file) return null;
  const targetLine = comment.line ?? comment.original_line;
  const targetSide = comment.side as LineSide;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.fileLine === targetLine && line.side === targetSide) return line.id;
    }
    // Context lines appear as side=BOTH — a LEFT comment on a context line is
    // valid (Pitfall 12).
    for (const hunk2 of [hunk]) {
      for (const line of hunk2.lines) {
        if (line.kind === 'context' && line.fileLine === targetLine) return line.id;
      }
    }
  }
  return null;
}

/**
 * Fetch all existing review comments on a PR and normalize them to
 * `ReadOnlyComment[]`. Includes inline comments (server-resolved to DiffLine.id
 * via `resolveCommentAnchor`) and top-level review bodies (`lineId: null`).
 *
 * Source: CONTEXT D-20 + D-22 + RESEARCH Q5.
 *   - `gh api --paginate` per Pitfall 22 (large PRs with many reviewers)
 *   - Orphan inline comments are counted and logged to stderr ONLY
 *     (`logger.warn`); the log includes only the count (T-3-07 — no PII).
 *   - On gh CLI failure the function throws via `mapGhError` (reused).
 */
export async function fetchExistingComments(
  owner: string,
  repo: string,
  prNumber: number,
  diffModel: DiffModel
): Promise<ReadOnlyComment[]> {
  try {
    const [inlineRaw, reviewsRaw] = await Promise.all([
      execa('gh', [
        'api',
        '--paginate',
        `repos/${owner}/${repo}/pulls/${prNumber}/comments`,
      ]),
      execa('gh', [
        'api',
        '--paginate',
        `repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
      ]),
    ]);
    const inline = JSON.parse(inlineRaw.stdout) as GhInlineComment[];
    interface GhReview {
      id: number;
      user: { login: string };
      body: string;
      submitted_at?: string;
      html_url: string;
    }
    const reviews = JSON.parse(reviewsRaw.stdout) as GhReview[];

    let orphanCount = 0;
    const inlineNormalized: ReadOnlyComment[] = inline.map((c) => {
      const lineId = resolveCommentAnchor(c, diffModel);
      if (!lineId) orphanCount++;
      return {
        id: c.id,
        lineId,
        path: c.path,
        line: c.line,
        side: c.side,
        author: c.user.login,
        createdAt: c.created_at,
        body: c.body,
        htmlUrl: c.html_url,
        threadId: c.in_reply_to_id ?? undefined,
      };
    });

    const topLevelNormalized: ReadOnlyComment[] = reviews
      .filter((r) => r.body && r.body.length > 0)
      .map((r) => ({
        id: r.id,
        lineId: null, // top-level reviews have no diff anchor
        path: '',
        line: null,
        side: 'BOTH' as const,
        author: r.user.login,
        createdAt: r.submitted_at ?? '',
        body: r.body,
        htmlUrl: r.html_url,
      }));

    if (orphanCount > 0) {
      // T-3-07: log count only, never body or author.
      logger.warn(`Skipped ${orphanCount} orphan comments`);
    }
    return [...inlineNormalized, ...topLevelNormalized];
  } catch (err) {
    throw mapGhError(err);
  }
}
