import { execa } from 'execa';
import { Octokit } from 'octokit';
import type { Thread, Verdict, ResolvedFinding } from '@shared/types';
import { threadToOctokitComment, collectPostableThreads, findingToOctokitComment, collectPostableFindings } from './anchor.js';
import { logger } from '../logger.js';

// D-07: Verdict mapping — plugin lowercase → GitHub API uppercase
const EVENT_MAP: Record<Verdict, 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'> = {
  approve: 'APPROVE',
  request_changes: 'REQUEST_CHANGES',
  comment: 'COMMENT',
};

/**
 * Get an authenticated Octokit instance using `gh auth token`.
 * Same pattern as server/src/ingest/github.ts.
 */
export async function getOctokit(): Promise<Octokit> {
  try {
    const { stdout } = await execa('gh', ['auth', 'token']);
    return new Octokit({ auth: stdout.trim() });
  } catch (err) {
    const raw = err as Error & { stderr?: string };
    const stderr = typeof raw.stderr === 'string' ? raw.stderr : '';
    if (stderr.includes('gh auth login') || stderr.includes('authentication')) {
      throw new Error("gh CLI is not authenticated. Run 'gh auth login' and try again.");
    }
    throw new Error(`gh auth token failed: ${raw.message ?? String(err)}`);
  }
}

export interface SubmitParams {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  verdict: Verdict;
  body: string;
  threads: Record<string, Thread>;
  findings: ResolvedFinding[];
  submissionId: string;
}

export interface SubmitResult {
  reviewId: number;
  url: string;
}

/**
 * Submit a GitHub review via Octokit pulls.createReview.
 * D-07: single atomic call. D-09: anchor adapter for comments.
 * D-10: submissionId embedded as HTML comment in body for idempotency tracking.
 */
export async function submitGithubReview(params: SubmitParams): Promise<SubmitResult> {
  const octokit = await getOctokit();
  const postable = collectPostableThreads(params.threads);
  const postableFindings = collectPostableFindings(params.findings, params.threads);

  // D-10: Embed submissionId for deduplication tracking
  const bodyWithId = `${params.body}\n\n<!-- submission_id: ${params.submissionId} -->`;

  const threadComments = postable.map((t) => {
    const c = threadToOctokitComment(t);
    return {
      path: c.path,
      body: c.body,
      line: c.line,
      side: c.side as 'LEFT' | 'RIGHT',
    };
  });

  const findingComments = postableFindings.map((f) => {
    const c = findingToOctokitComment(f);
    return {
      path: c.path,
      body: c.body,
      line: c.line,
      side: c.side as 'LEFT' | 'RIGHT',
    };
  });

  const comments = [...threadComments, ...findingComments];

  logger.info(`Submitting review: ${postable.length} thread comments + ${postableFindings.length} finding comments, verdict=${params.verdict}`);

  const { data: review } = await octokit.rest.pulls.createReview({
    owner: params.owner,
    repo: params.repo,
    pull_number: params.pullNumber,
    commit_id: params.headSha,
    event: EVENT_MAP[params.verdict],
    body: bodyWithId,
    comments: comments as Parameters<typeof octokit.rest.pulls.createReview>[0] extends { comments?: (infer C)[] } ? C[] : never[],
  });

  return {
    reviewId: review.id,
    url: review.html_url,
  };
}
