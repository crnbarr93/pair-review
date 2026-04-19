import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { tokenValidate } from '../middleware/token-validate.js';
import type { ReviewSession, PullRequestMeta, DiffModel } from '@shared/types';

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
    },
    applyEventSpy,
  };
}

async function buildApp(token: string, sessionExists = true) {
  const { mountSessionEvents } = await import('../routes/session-events.js');
  const built = buildManager({ token, sessionExists });
  const app = new Hono();
  app.use('/api/*', tokenValidate(built.manager as never));
  mountSessionEvents(app, built.manager as never);
  return { app, ...built };
}

function authedHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Cookie: `review_session=${token}`,
    'X-Review-Token': token,
  };
}

describe('POST /api/session/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy-1: accepts file.reviewStatusSet and returns ok:true', async () => {
    const { app, applyEventSpy } = await buildApp('tok', true);
    const res = await app.fetch(
      new Request('http://localhost/api/session/events', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          event: { type: 'file.reviewStatusSet', fileId: 'abc', status: 'reviewed' },
        }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(applyEventSpy).toHaveBeenCalledTimes(1);
    const [prKey, event] = applyEventSpy.mock.calls[0] as [string, { type: string }];
    expect(prKey).toBe('gh:owner/repo#1');
    expect(event.type).toBe('file.reviewStatusSet');
  });

  it('happy-2: accepts file.generatedExpandToggled and returns ok:true', async () => {
    const { app, applyEventSpy } = await buildApp('tok', true);
    const res = await app.fetch(
      new Request('http://localhost/api/session/events', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          event: { type: 'file.generatedExpandToggled', fileId: 'abc', expanded: true },
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(applyEventSpy).toHaveBeenCalledTimes(1);
    const [, event] = applyEventSpy.mock.calls[0] as [string, { type: string }];
    expect(event.type).toBe('file.generatedExpandToggled');
  });

  it('reject-server-only-1: rejects existingComments.loaded with 400 (server-only event)', async () => {
    const { app, applyEventSpy } = await buildApp('tok', true);
    const res = await app.fetch(
      new Request('http://localhost/api/session/events', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          event: { type: 'existingComments.loaded', comments: [] },
        }),
      })
    );
    expect(res.status).toBe(400);
    expect(applyEventSpy).not.toHaveBeenCalled();
  });

  it('reject-server-only-2: rejects ciChecks.loaded with 400 (server-only event)', async () => {
    const { app, applyEventSpy } = await buildApp('tok', true);
    const res = await app.fetch(
      new Request('http://localhost/api/session/events', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          event: { type: 'ciChecks.loaded', ciStatus: { aggregate: 'pass', checks: [] } },
        }),
      })
    );
    expect(res.status).toBe(400);
    expect(applyEventSpy).not.toHaveBeenCalled();
  });

  it('reject-server-only-3: rejects session.reset with 400 (server-only event)', async () => {
    const { app, applyEventSpy } = await buildApp('tok', true);
    const res = await app.fetch(
      new Request('http://localhost/api/session/events', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          event: { type: 'session.reset' },
        }),
      })
    );
    expect(res.status).toBe(400);
    expect(applyEventSpy).not.toHaveBeenCalled();
  });

  it('auth-1: missing X-Review-Token → 403', async () => {
    const { app, applyEventSpy } = await buildApp('tok', true);
    const res = await app.fetch(
      new Request('http://localhost/api/session/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'review_session=tok',
          // no X-Review-Token
        },
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          event: { type: 'file.reviewStatusSet', fileId: 'abc', status: 'reviewed' },
        }),
      })
    );
    expect(res.status).toBe(403);
    expect(applyEventSpy).not.toHaveBeenCalled();
  });

  it('unknown-prKey-1: valid body but unknown prKey → 404', async () => {
    const { app, applyEventSpy } = await buildApp('tok', false);
    const res = await app.fetch(
      new Request('http://localhost/api/session/events', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#unknown',
          event: { type: 'file.reviewStatusSet', fileId: 'abc', status: 'reviewed' },
        }),
      })
    );
    expect(res.status).toBe(404);
    expect(applyEventSpy).not.toHaveBeenCalled();
  });

  it('validation-1: malformed JSON body → 400', async () => {
    const { app } = await buildApp('tok', true);
    const res = await app.fetch(
      new Request('http://localhost/api/session/events', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: 'not json at all',
      })
    );
    expect(res.status).toBe(400);
  });

  it('validation-2: missing event field → 400', async () => {
    const { app } = await buildApp('tok', true);
    const res = await app.fetch(
      new Request('http://localhost/api/session/events', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({ prKey: 'gh:owner/repo#1' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('validation-3: empty prKey → 400', async () => {
    const { app } = await buildApp('tok', true);
    const res = await app.fetch(
      new Request('http://localhost/api/session/events', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: '',
          event: { type: 'file.reviewStatusSet', fileId: 'abc', status: 'reviewed' },
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('validation-4: invalid review status value → 400', async () => {
    const { app } = await buildApp('tok', true);
    const res = await app.fetch(
      new Request('http://localhost/api/session/events', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          event: { type: 'file.reviewStatusSet', fileId: 'abc', status: 'bogus' },
        }),
      })
    );
    expect(res.status).toBe(400);
  });
});
