import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { tokenValidate } from '../middleware/token-validate.js';
import type { ReviewSession, PullRequestMeta, DiffModel } from '@shared/types';

// Mock the ingest + highlight modules so tests don't shell out
vi.mock('../../ingest/github.js', () => ({
  ingestGithub: vi.fn(async () => ({
    meta: {
      title: 'Test PR',
      body: 'desc',
      author: { login: 'testuser' },
      baseRefName: 'main',
      headRefName: 'feat/x',
      baseRefOid: 'abc000',
      headRefOid: 'def111',
      additions: 10,
      deletions: 2,
      changedFiles: 1,
    },
    diffText:
      'diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-const x = 1;\n+const x = 2;\n',
  })),
  fetchCurrentHeadSha: vi.fn(async () => 'def111'),
}));
vi.mock('../../ingest/local.js', () => ({
  ingestLocal: vi.fn(async () => ({
    diffText: 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-1\n+2\n',
    baseSha: 'bsha',
    headSha: 'hsha',
  })),
  fetchCurrentHeadSha: vi.fn(async () => 'hsha'),
}));
vi.mock('../../highlight/shiki.js', () => ({
  highlightHunks: vi.fn(async () => []),
}));

const stubSession: ReviewSession = {
  prKey: 'gh:owner/repo#1',
  pr: {
    source: 'github',
    title: 'Test',
    description: 'd',
    author: 'a',
    baseBranch: 'main',
    headBranch: 'feat',
    baseSha: 'b',
    headSha: 'h',
    additions: 0,
    deletions: 0,
    filesChanged: 0,
  } as PullRequestMeta,
  diff: { files: [], totalHunks: 0 } as DiffModel,
  shikiTokens: {},
  createdAt: new Date().toISOString(),
  headSha: 'h',
  error: null,
  lastEventId: 0,
};

function buildManager(opts: { token: string; sessionExists?: boolean }) {
  const applyEventSpy = vi.fn(async () => stubSession);
  const resetSessionSpy = vi.fn(async () => stubSession);
  return {
    manager: {
      getSessionToken: () => opts.token,
      getHttpPort: () => 8080,
      getLaunchUrl: () => `http://127.0.0.1:8080/?token=${opts.token}`,
      sessionLaunchUrl: (prKey: string) =>
        `http://127.0.0.1:8080/?token=${opts.token}&session=${encodeURIComponent(prKey)}`,
      getTokenLast4: () => opts.token.slice(-4),
      get: () => (opts.sessionExists ? stubSession : undefined),
      applyEvent: applyEventSpy,
      resetSession: resetSessionSpy,
    },
    applyEventSpy,
    resetSessionSpy,
  };
}

async function buildApp(token: string, sessionExists = true) {
  const { mountSessionResume } = await import('../routes/session-resume.js');
  const built = buildManager({ token, sessionExists });
  const app = new Hono();
  app.use('/api/*', tokenValidate(built.manager as any));
  mountSessionResume(app, built.manager as any);
  return { app, ...built };
}

function authedHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Cookie: `review_session=${token}`,
    'X-Review-Token': token,
  };
}

describe('POST /api/session/choose-resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validation-1: invalid choice → 400', async () => {
    const { app } = await buildApp('tok');
    const res = await app.fetch(
      new Request('http://localhost/api/session/choose-resume', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          choice: 'bogus',
          source: { kind: 'github', number: 1 },
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('validation-2: missing choice → 400', async () => {
    const { app } = await buildApp('tok');
    const res = await app.fetch(
      new Request('http://localhost/api/session/choose-resume', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({ prKey: 'gh:owner/repo#1' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('validation-3: strict schema rejects extra fields → 400', async () => {
    const { app } = await buildApp('tok');
    const res = await app.fetch(
      new Request('http://localhost/api/session/choose-resume', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          choice: 'adopt',
          source: { kind: 'github', number: 1 },
          extra: 'nope',
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('auth-1: missing X-Review-Token header → 403', async () => {
    const { app } = await buildApp('tok');
    const res = await app.fetch(
      new Request('http://localhost/api/session/choose-resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'review_session=tok',
          // no X-Review-Token
        },
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          choice: 'adopt',
          source: { kind: 'github', number: 1 },
        }),
      })
    );
    expect(res.status).toBe(403);
  });

  it('missing-session-1: valid body but unknown prKey → 404', async () => {
    const { app } = await buildApp('tok', false);
    const res = await app.fetch(
      new Request('http://localhost/api/session/choose-resume', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          choice: 'adopt',
          source: { kind: 'github', number: 1 },
        }),
      })
    );
    expect(res.status).toBe(404);
  });

  it('adopt-1: choice=adopt calls applyEvent with session.adoptNewDiff', async () => {
    const { app, applyEventSpy } = await buildApp('tok', true);
    const res = await app.fetch(
      new Request('http://localhost/api/session/choose-resume', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          choice: 'adopt',
          source: { kind: 'github', number: 1 },
        }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(applyEventSpy).toHaveBeenCalledTimes(1);
    const [prKey, event] = applyEventSpy.mock.calls[0] as [string, { type: string }];
    expect(prKey).toBe('gh:owner/repo#1');
    expect(event.type).toBe('session.adoptNewDiff');
  });

  it('reset-1: choice=reset calls resetSession', async () => {
    const { app, resetSessionSpy } = await buildApp('tok', true);
    const res = await app.fetch(
      new Request('http://localhost/api/session/choose-resume', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          choice: 'reset',
          source: { kind: 'github', number: 1 },
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(resetSessionSpy).toHaveBeenCalledTimes(1);
    const [prKey] = resetSessionSpy.mock.calls[0] as [string];
    expect(prKey).toBe('gh:owner/repo#1');
  });

  it('viewBoth-1: choice=viewBoth applies session.viewBoth', async () => {
    const { app, applyEventSpy } = await buildApp('tok', true);
    const res = await app.fetch(
      new Request('http://localhost/api/session/choose-resume', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          choice: 'viewBoth',
          source: { kind: 'github', number: 1 },
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(applyEventSpy).toHaveBeenCalledTimes(1);
    const [, event] = applyEventSpy.mock.calls[0] as [string, { type: string }];
    expect(event.type).toBe('session.viewBoth');
  });
});
