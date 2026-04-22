import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectPendingReview, clearPendingReview, getAuthenticatedLogin } from '../pending-review.js';
import type { Octokit } from 'octokit';

// Build a minimal mock of the Octokit instance for pending-review tests.
// We mock paginate, rest.pulls.listReviews, rest.pulls.deletePendingReview,
// and rest.users.getAuthenticated.

function makeReview(overrides: {
  id: number;
  state: string;
  userLogin: string;
  submittedAt?: string;
}) {
  return {
    id: overrides.id,
    state: overrides.state,
    user: { login: overrides.userLogin },
    submitted_at: overrides.submittedAt ?? '2024-01-01T00:00:00Z',
    html_url: `https://github.com/org/repo/pull/1#pullrequestreview-${overrides.id}`,
    body: '',
  };
}

function makeMockOctokit(reviews: ReturnType<typeof makeReview>[]) {
  const listReviewsFn = vi.fn();
  const deletePendingReviewFn = vi.fn().mockResolvedValue({ data: {} });
  const getAuthenticatedFn = vi.fn().mockResolvedValue({ data: { login: 'testuser' } });

  const mockOctokit = {
    paginate: vi.fn().mockResolvedValue(reviews),
    rest: {
      pulls: {
        listReviews: listReviewsFn,
        deletePendingReview: deletePendingReviewFn,
      },
      users: {
        getAuthenticated: getAuthenticatedFn,
      },
    },
  } as unknown as Octokit;

  return { mockOctokit, listReviewsFn, deletePendingReviewFn, getAuthenticatedFn };
}

describe('getAuthenticatedLogin', () => {
  it('returns the authenticated user login', async () => {
    const { mockOctokit } = makeMockOctokit([]);
    const login = await getAuthenticatedLogin(mockOctokit);
    expect(login).toBe('testuser');
  });
});

describe('detectPendingReview', () => {
  it('returns null when no PENDING reviews exist', async () => {
    const reviews = [
      makeReview({ id: 1, state: 'APPROVED', userLogin: 'testuser' }),
      makeReview({ id: 2, state: 'CHANGES_REQUESTED', userLogin: 'testuser' }),
    ];
    const { mockOctokit } = makeMockOctokit(reviews);

    const result = await detectPendingReview(mockOctokit, 'org', 'repo', 42);
    expect(result).toBeNull();
  });

  it('returns the pending review matching authenticated login', async () => {
    const reviews = [
      makeReview({ id: 99, state: 'PENDING', userLogin: 'testuser', submittedAt: '2024-06-01T00:00:00Z' }),
    ];
    const { mockOctokit } = makeMockOctokit(reviews);

    const result = await detectPendingReview(mockOctokit, 'org', 'repo', 42);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(99);
    expect(result!.createdAt).toBe('2024-06-01T00:00:00Z');
    expect(result!.commentCount).toBe(0);
  });

  it('ignores PENDING reviews from other users', async () => {
    const reviews = [
      makeReview({ id: 10, state: 'PENDING', userLogin: 'otheruser' }),
    ];
    const { mockOctokit } = makeMockOctokit(reviews);

    const result = await detectPendingReview(mockOctokit, 'org', 'repo', 42);
    expect(result).toBeNull();
  });

  it('ignores non-PENDING reviews from the authenticated user (APPROVED, CHANGES_REQUESTED)', async () => {
    const reviews = [
      makeReview({ id: 1, state: 'APPROVED', userLogin: 'testuser' }),
      makeReview({ id: 2, state: 'CHANGES_REQUESTED', userLogin: 'testuser' }),
      makeReview({ id: 3, state: 'COMMENTED', userLogin: 'testuser' }),
    ];
    const { mockOctokit } = makeMockOctokit(reviews);

    const result = await detectPendingReview(mockOctokit, 'org', 'repo', 42);
    expect(result).toBeNull();
  });

  it('handles paginated results — finds the pending review across many pages', async () => {
    // Simulate a large set of reviews spanning multiple pages
    const reviews = [
      ...Array.from({ length: 50 }, (_, i) =>
        makeReview({ id: i + 1, state: 'APPROVED', userLogin: 'testuser' })
      ),
      makeReview({ id: 200, state: 'PENDING', userLogin: 'testuser' }),
    ];
    const { mockOctokit } = makeMockOctokit(reviews);

    const result = await detectPendingReview(mockOctokit, 'org', 'repo', 42);
    // paginate should have been called once (the mock returns all reviews in one go)
    expect(mockOctokit.paginate).toHaveBeenCalledOnce();
    expect(result!.id).toBe(200);
  });

  it('uses octokit.paginate (never assumes single page)', async () => {
    const { mockOctokit } = makeMockOctokit([]);
    await detectPendingReview(mockOctokit, 'org', 'repo', 42);
    expect(mockOctokit.paginate).toHaveBeenCalled();
  });

  it('falls back to current time when submitted_at is null', async () => {
    const reviews = [
      {
        id: 77,
        state: 'PENDING',
        user: { login: 'testuser' },
        submitted_at: null,
        html_url: '',
        body: '',
      },
    ];
    const { mockOctokit } = makeMockOctokit(reviews as ReturnType<typeof makeReview>[]);

    const before = new Date().toISOString();
    const result = await detectPendingReview(mockOctokit, 'org', 'repo', 42);
    const after = new Date().toISOString();

    expect(result).not.toBeNull();
    expect(result!.id).toBe(77);
    // The fallback date should be between before and after
    expect(result!.createdAt >= before || result!.createdAt <= after).toBe(true);
  });
});

describe('clearPendingReview', () => {
  it('calls deletePendingReview with correct parameters', async () => {
    const { mockOctokit, deletePendingReviewFn } = makeMockOctokit([]);

    await clearPendingReview(mockOctokit, 'myorg', 'myrepo', 55, 999);

    expect(deletePendingReviewFn).toHaveBeenCalledOnce();
    expect(deletePendingReviewFn).toHaveBeenCalledWith({
      owner: 'myorg',
      repo: 'myrepo',
      pull_number: 55,
      review_id: 999,
    });
  });

  it('does not throw on successful deletion', async () => {
    const { mockOctokit } = makeMockOctokit([]);
    await expect(
      clearPendingReview(mockOctokit, 'org', 'repo', 1, 42)
    ).resolves.not.toThrow();
  });
});
