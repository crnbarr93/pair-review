import { describe, it, expect } from 'vitest';
import { applyEvent } from '../reducer.js';
import type { ReviewSession, SubmissionState, PendingReview } from '@shared/types';

function baseSession(): ReviewSession {
  return {
    prKey: 'gh:owner/repo#1',
    pr: {
      source: 'github',
      title: 'Test PR',
      description: 'Test description.',
      author: 'testuser',
      baseBranch: 'main',
      headBranch: 'feature/test',
      baseSha: 'aaa111',
      headSha: 'abc',
      additions: 10,
      deletions: 2,
      filesChanged: 2,
      number: 1,
      owner: 'owner',
      repo: 'repo',
    },
    diff: { files: [], totalHunks: 0 },
    shikiTokens: {},
    createdAt: '2026-04-22T00:00:00Z',
    headSha: 'abc',
    error: null,
    lastEventId: 0,
  };
}

describe('reducer Phase 6 events', () => {
  describe('submission.proposed', () => {
    it('sets pendingSubmission with verdict and body', () => {
      const s = baseSession();
      const out = applyEvent(s, {
        type: 'submission.proposed',
        verdict: 'request_changes',
        body: 'This PR has issues.',
      });
      expect(out).not.toBe(s);
      expect(out.pendingSubmission).toEqual({
        verdict: 'request_changes',
        body: 'This PR has issues.',
      });
    });

    it('overwrites a previous pendingSubmission', () => {
      const s: ReviewSession = {
        ...baseSession(),
        pendingSubmission: { verdict: 'approve', body: 'Old draft.' },
      };
      const out = applyEvent(s, {
        type: 'submission.proposed',
        verdict: 'comment',
        body: 'New draft.',
      });
      expect(out.pendingSubmission).toEqual({ verdict: 'comment', body: 'New draft.' });
    });
  });

  describe('submission.confirmed', () => {
    it('sets submissionState.status to submitting with submissionId', () => {
      const s = baseSession();
      const out = applyEvent(s, {
        type: 'submission.confirmed',
        submissionId: 'sub_abc123',
      });
      expect(out).not.toBe(s);
      const state = out.submissionState as SubmissionState;
      expect(state.status).toBe('submitting');
      expect(state.submissionId).toBe('sub_abc123');
    });
  });

  describe('submission.completed', () => {
    it('sets submissionState.status to submitted and clears pendingSubmission', () => {
      const s: ReviewSession = {
        ...baseSession(),
        pendingSubmission: { verdict: 'request_changes', body: 'Draft.' },
        submissionState: { status: 'submitting', submissionId: 'sub_abc123' },
      };
      const out = applyEvent(s, {
        type: 'submission.completed',
        submissionId: 'sub_abc123',
        reviewId: 42,
        url: 'https://github.com/owner/repo/pull/1#pullrequestreview-42',
      });
      expect(out).not.toBe(s);
      const state = out.submissionState as SubmissionState;
      expect(state.status).toBe('submitted');
      expect(out.pendingSubmission).toBeUndefined();
    });

    it('stores reviewId and url in submissionState', () => {
      const s = baseSession();
      const out = applyEvent(s, {
        type: 'submission.completed',
        submissionId: 'sub_xyz789',
        reviewId: 99,
        url: 'https://github.com/owner/repo/pull/1#pullrequestreview-99',
      });
      const state = out.submissionState as SubmissionState;
      expect(state.reviewId).toBe(99);
      expect(state.url).toBe('https://github.com/owner/repo/pull/1#pullrequestreview-99');
      expect(state.submissionId).toBe('sub_xyz789');
    });
  });

  describe('submission.failed', () => {
    it('sets submissionState.status to failed with error message', () => {
      const s = baseSession();
      const out = applyEvent(s, {
        type: 'submission.failed',
        error: 'Octokit request failed: 422 Unprocessable Entity',
      });
      expect(out).not.toBe(s);
      const state = out.submissionState as SubmissionState;
      expect(state.status).toBe('failed');
      expect(state.error).toBe('Octokit request failed: 422 Unprocessable Entity');
    });
  });

  describe('pendingReview.detected', () => {
    it('sets pendingReview with reviewId, createdAt, commentCount', () => {
      const s = baseSession();
      const out = applyEvent(s, {
        type: 'pendingReview.detected',
        reviewId: 777,
        createdAt: '2026-04-21T10:00:00Z',
        commentCount: 3,
      });
      expect(out).not.toBe(s);
      const pr = out.pendingReview as PendingReview;
      expect(pr.reviewId).toBe(777);
      expect(pr.createdAt).toBe('2026-04-21T10:00:00Z');
      expect(pr.commentCount).toBe(3);
    });
  });

  describe('pendingReview.resolved', () => {
    it('clears pendingReview to undefined', () => {
      const s: ReviewSession = {
        ...baseSession(),
        pendingReview: { reviewId: 777, createdAt: '2026-04-21T10:00:00Z', commentCount: 3 },
      };
      const out = applyEvent(s, { type: 'pendingReview.resolved' });
      expect(out).not.toBe(s);
      expect(out.pendingReview).toBeUndefined();
    });
  });

  describe('purity invariants', () => {
    it('does not mutate the original session on submission.proposed', () => {
      const s = baseSession();
      const snapshot = JSON.stringify(s);
      applyEvent(s, { type: 'submission.proposed', verdict: 'approve', body: 'LGTM!' });
      expect(JSON.stringify(s)).toBe(snapshot);
    });

    it('does not mutate the original session on submission.completed', () => {
      const s: ReviewSession = {
        ...baseSession(),
        pendingSubmission: { verdict: 'comment', body: 'Some draft.' },
      };
      const snapshot = JSON.stringify(s);
      applyEvent(s, {
        type: 'submission.completed',
        submissionId: 'sub_pure',
        reviewId: 1,
        url: 'https://github.com/owner/repo/pull/1#pullrequestreview-1',
      });
      expect(JSON.stringify(s)).toBe(snapshot);
    });

    it('does not mutate the original session on pendingReview.detected', () => {
      const s = baseSession();
      const snapshot = JSON.stringify(s);
      applyEvent(s, {
        type: 'pendingReview.detected',
        reviewId: 888,
        createdAt: '2026-04-22T00:00:00Z',
        commentCount: 5,
      });
      expect(JSON.stringify(s)).toBe(snapshot);
    });

    it('returns a new object (referential inequality) for all 6 new event types', () => {
      const s = baseSession();

      const r1 = applyEvent(s, { type: 'submission.proposed', verdict: 'comment', body: 'x' });
      expect(r1).not.toBe(s);

      const r2 = applyEvent(s, { type: 'submission.confirmed', submissionId: 'id1' });
      expect(r2).not.toBe(s);

      const r3 = applyEvent(s, { type: 'submission.completed', submissionId: 'id1' });
      expect(r3).not.toBe(s);

      const r4 = applyEvent(s, { type: 'submission.failed', error: 'err' });
      expect(r4).not.toBe(s);

      const r5 = applyEvent(s, {
        type: 'pendingReview.detected',
        reviewId: 1,
        createdAt: '2026-04-22T00:00:00Z',
        commentCount: 0,
      });
      expect(r5).not.toBe(s);

      const r6 = applyEvent(s, { type: 'pendingReview.resolved' });
      expect(r6).not.toBe(s);
    });
  });
});
