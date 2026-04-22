import { Octokit } from 'octokit';
import { logger } from '../logger.js';

export interface PendingReviewInfo {
  id: number;
  commentCount: number;
  createdAt: string;
}

/**
 * Get the authenticated GitHub login. Cached per Octokit instance.
 */
export async function getAuthenticatedLogin(octokit: Octokit): Promise<string> {
  const { data } = await octokit.rest.users.getAuthenticated();
  return data.login;
}

/**
 * Detect a pending review from the authenticated user on a PR.
 * D-08: queries GET /repos/{o}/{r}/pulls/{n}/reviews, filters client-side for PENDING + login match.
 * Uses octokit.paginate to handle PRs with many historical reviews (Pitfall D).
 */
export async function detectPendingReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<PendingReviewInfo | null> {
  const login = await getAuthenticatedLogin(octokit);

  const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  const pending = reviews.find(
    (r) => r.state === 'PENDING' && r.user?.login === login,
  );

  if (!pending) return null;

  logger.warn(`Pending review detected: reviewId=${pending.id}`);

  return {
    id: pending.id,
    commentCount: 0, // GitHub does not return comment count on listReviews
    createdAt: pending.submitted_at ?? new Date().toISOString(),
  };
}

/**
 * Clear (delete) a pending review from GitHub.
 * D-08: "Clear" option in the adopt-or-clear modal.
 */
export async function clearPendingReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  reviewId: number,
): Promise<void> {
  await octokit.rest.pulls.deletePendingReview({
    owner,
    repo,
    pull_number: pullNumber,
    review_id: reviewId,
  });
  logger.info(`Cleared pending review: reviewId=${reviewId}`);
}
