import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { tokenValidate } from '../../middleware/token-validate.js';
import type { ReviewSession, SessionEvent, Thread } from '@shared/types';

// Mock the submit modules before importing the route
vi.mock('../../../submit/octokit-submit.js', () => ({
  submitGithubReview: vi.fn(),
}));
vi.mock('../../../submit/markdown-export.js', () => ({
  exportReviewMarkdown: vi.fn(),
}));

// Import mocks after vi.mock
import { submitGithubReview } from '../../../submit/octokit-submit.js';
import { exportReviewMarkdown } from '../../../submit/markdown-export.js';

const submitGithubReviewMock = submitGithubReview as ReturnType<typeof vi.fn>;
const exportReviewMarkdownMock = exportReviewMarkdown as ReturnType<typeof vi.fn>;

function makeThread(threadId: string, draftBody?: string): Thread {
  return {
    threadId,
    lineId: 'f1:h0:l0',
    path: 'src/auth.ts',
    line: 42,
    side: 'RIGHT',
    preExisting: false,
    turns: [{ author: 'llm', message: 'review this', createdAt: '2026-04-22T00:00:00Z' }],
    resolved: false,
    createdAt: '2026-04-22T00:00:00Z',
    draftBody,
  };
}

function makeSession(overrides?: Partial<ReviewSession>): ReviewSession {
  return {
    prKey: 'gh:owner/repo#1',
    pr: {
      source: 'github',
      title: 'Test PR',
      description: 'A test PR',
      author: 'alice',
      baseBranch: 'main',
      headBranch: 'feat',
      baseSha: 'aaabbb',
      headSha: 'cccdd',
      additions: 10,
      deletions: 2,
      filesChanged: 1,
      number: 1,
      owner: 'owner',
      repo: 'repo',
    },
    diff: { files: [], totalHunks: 0 },
    shikiTokens: {},
    createdAt: '2026-04-20T00:00:00Z',
    headSha: 'cccdd',
    error: null,
    lastEventId: 0,
    threads: {},
    ...overrides,
  };
}

function buildManager(opts: {
  token: string;
  session?: ReviewSession | null;
}) {
  const appliedEvents: { prKey: string; event: SessionEvent }[] = [];
  const applyEventSpy = vi.fn(async (prKey: string, event: SessionEvent) => {
    appliedEvents.push({ prKey, event });
    return opts.session!;
  });
  return {
    manager: {
      getSessionToken: () => opts.token,
      getHttpPort: () => 8080,
      get: (_key: string) => opts.session ?? undefined,
      applyEvent: applyEventSpy,
    },
    applyEventSpy,
    appliedEvents,
  };
}

async function buildApp(opts: {
  token: string;
  session?: ReviewSession | null;
}) {
  const { mountConfirmSubmit } = await import('../confirm-submit.js');
  const built = buildManager(opts);
  const app = new Hono();
  app.use('/api/*', tokenValidate(built.manager as never));
  mountConfirmSubmit(app, built.manager as never);
  return { app, ...built };
}

function authedHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Cookie: `review_session=${token}`,
    'X-Review-Token': token,
  };
}

describe('POST /api/confirm-submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 for invalid body (missing verdict)', async () => {
    const { app } = await buildApp({ token: 'tok', session: makeSession() });
    const res = await app.fetch(
      new Request('http://localhost/api/confirm-submit', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          // missing verdict
          body: 'Looks good',
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown session', async () => {
    const { app } = await buildApp({ token: 'tok', session: null });
    const res = await app.fetch(
      new Request('http://localhost/api/confirm-submit', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#999',
          verdict: 'approve',
          body: 'Looks good',
        }),
      })
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 when submissionState.status is submitted (D-10)', async () => {
    const submittedSession = makeSession({
      submissionState: {
        status: 'submitted',
        submissionId: 'existingId123',
        reviewId: 42,
        url: 'https://github.com/owner/repo/pull/1#pullrequestreview-42',
      },
    });
    const { app } = await buildApp({ token: 'tok', session: submittedSession });
    const res = await app.fetch(
      new Request('http://localhost/api/confirm-submit', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          verdict: 'approve',
          body: 'Duplicate submit attempt',
        }),
      })
    );
    expect(res.status).toBe(409);
  });

  it('GitHub mode: applies submission.confirmed before calling submitGithubReview', async () => {
    submitGithubReviewMock.mockResolvedValueOnce({
      reviewId: 100,
      url: 'https://github.com/owner/repo/pull/1#pullrequestreview-100',
    });
    const { app, appliedEvents } = await buildApp({
      token: 'tok',
      session: makeSession(),
    });

    const res = await app.fetch(
      new Request('http://localhost/api/confirm-submit', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          verdict: 'approve',
          body: 'Great changes!',
        }),
      })
    );

    expect(res.status).toBe(200);
    // submission.confirmed must come before submission.completed
    expect(appliedEvents[0].event.type).toBe('submission.confirmed');
    expect(appliedEvents[1].event.type).toBe('submission.completed');
  });

  it('GitHub mode: calls submitGithubReview and applies submission.completed on success', async () => {
    submitGithubReviewMock.mockResolvedValueOnce({
      reviewId: 100,
      url: 'https://github.com/owner/repo/pull/1#pullrequestreview-100',
    });
    const session = makeSession({
      threads: {
        't1': makeThread('t1', 'Fix this null check'),
      },
    });
    const { app, appliedEvents } = await buildApp({ token: 'tok', session });

    const res = await app.fetch(
      new Request('http://localhost/api/confirm-submit', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          verdict: 'request_changes',
          body: 'Needs fixes',
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.url).toBe('https://github.com/owner/repo/pull/1#pullrequestreview-100');

    // Verify submitGithubReview was called with correct args
    expect(submitGithubReviewMock).toHaveBeenCalledTimes(1);
    const callArgs = submitGithubReviewMock.mock.calls[0][0];
    expect(callArgs.owner).toBe('owner');
    expect(callArgs.repo).toBe('repo');
    expect(callArgs.pullNumber).toBe(1);
    expect(callArgs.verdict).toBe('request_changes');
    expect(callArgs.body).toBe('Needs fixes');

    // Verify submission.completed event
    const completedEvent = appliedEvents.find((e) => e.event.type === 'submission.completed');
    expect(completedEvent).toBeDefined();
    if (completedEvent?.event.type === 'submission.completed') {
      expect(completedEvent.event.reviewId).toBe(100);
      expect(completedEvent.event.url).toBe(
        'https://github.com/owner/repo/pull/1#pullrequestreview-100',
      );
    }
  });

  it('GitHub mode: on Octokit error, applies submission.failed and returns 500', async () => {
    submitGithubReviewMock.mockRejectedValueOnce(new Error('GitHub API rate limit exceeded'));
    const { app, appliedEvents } = await buildApp({ token: 'tok', session: makeSession() });

    const res = await app.fetch(
      new Request('http://localhost/api/confirm-submit', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          verdict: 'comment',
          body: 'Some comments',
        }),
      })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('rate limit');

    const failedEvent = appliedEvents.find((e) => e.event.type === 'submission.failed');
    expect(failedEvent).toBeDefined();
    if (failedEvent?.event.type === 'submission.failed') {
      expect(failedEvent.event.error).toContain('rate limit');
    }
  });

  it('Local mode: calls exportReviewMarkdown and applies submission.completed', async () => {
    exportReviewMarkdownMock.mockResolvedValueOnce(undefined);
    const session = makeSession({
      prKey: 'local:abc123',
      pr: {
        source: 'local',
        title: 'Local diff review',
        description: '',
        author: 'local',
        baseBranch: 'main',
        headBranch: 'feat',
        baseSha: 'aaabbb',
        headSha: 'cccdd',
        additions: 5,
        deletions: 0,
        filesChanged: 1,
      },
    });
    const { app, appliedEvents } = await buildApp({ token: 'tok', session });

    const res = await app.fetch(
      new Request('http://localhost/api/confirm-submit', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'local:abc123',
          verdict: 'comment',
          body: 'Local review notes',
          exportPath: '/tmp/review.md',
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.path).toBe('/tmp/review.md');

    expect(exportReviewMarkdownMock).toHaveBeenCalledTimes(1);
    const callArgs = exportReviewMarkdownMock.mock.calls[0][0];
    expect(callArgs.exportPath).toBe('/tmp/review.md');
    expect(callArgs.verdict).toBe('comment');
    expect(callArgs.body).toBe('Local review notes');

    const completedEvent = appliedEvents.find((e) => e.event.type === 'submission.completed');
    expect(completedEvent).toBeDefined();
    if (completedEvent?.event.type === 'submission.completed') {
      expect(completedEvent.event.exportPath).toBe('/tmp/review.md');
    }
  });

  it('Local mode: returns 400 if exportPath is missing', async () => {
    const session = makeSession({ prKey: 'local:abc123' });
    const { app, appliedEvents } = await buildApp({ token: 'tok', session });

    const res = await app.fetch(
      new Request('http://localhost/api/confirm-submit', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'local:abc123',
          verdict: 'comment',
          body: 'Some review',
          // no exportPath
        }),
      })
    );

    expect(res.status).toBe(400);
    // submission.failed should be applied before 400 is returned
    const failedEvent = appliedEvents.find((e) => e.event.type === 'submission.failed');
    expect(failedEvent).toBeDefined();
  });

  it('applies submission.confirmed before calling submit (event ordering)', async () => {
    submitGithubReviewMock.mockResolvedValueOnce({
      reviewId: 200,
      url: 'https://github.com/owner/repo/pull/1#pullrequestreview-200',
    });
    const { app, appliedEvents } = await buildApp({ token: 'tok', session: makeSession() });

    await app.fetch(
      new Request('http://localhost/api/confirm-submit', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          verdict: 'approve',
          body: 'LGTM',
        }),
      })
    );

    // Events should be in order: confirmed → completed
    const eventTypes = appliedEvents.map((e) => e.event.type);
    const confirmedIdx = eventTypes.indexOf('submission.confirmed');
    const completedIdx = eventTypes.indexOf('submission.completed');
    expect(confirmedIdx).toBeGreaterThanOrEqual(0);
    expect(completedIdx).toBeGreaterThan(confirmedIdx);
  });

  it('strict schema: rejects unknown keys in request body', async () => {
    const { app } = await buildApp({ token: 'tok', session: makeSession() });
    const res = await app.fetch(
      new Request('http://localhost/api/confirm-submit', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          verdict: 'approve',
          body: 'Looks good',
          unknownExtraField: 'should-be-rejected',
        }),
      })
    );
    expect(res.status).toBe(400);
  });
});
