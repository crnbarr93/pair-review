import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { tokenValidate } from '../middleware/token-validate.js';
import { mountEvents } from '../routes/events.js';
import type { ReviewSession, PullRequestMeta, DiffModel } from '@shared/types';

// Minimal ReviewSession fixture that satisfies the type shape
const stubSession: ReviewSession = {
  prKey: 'gh:owner/repo#1',
  pr: {
    source: 'github',
    title: 'Test PR',
    description: 'A test PR',
    author: 'testuser',
    baseBranch: 'main',
    headBranch: 'feature',
    baseSha: 'abc123',
    headSha: 'def456',
    additions: 10,
    deletions: 5,
    filesChanged: 2,
  } as PullRequestMeta,
  diff: { files: [], totalHunks: 0 } as DiffModel,
  shikiTokens: {},
  createdAt: new Date().toISOString(),
  headSha: 'def456',
  error: null,
};

function buildManager(opts: { token: string; port: number; session?: ReviewSession }) {
  return {
    getSessionToken: () => opts.token,
    getHttpPort: () => opts.port,
    getLaunchUrl: () => `http://127.0.0.1:${opts.port}/?token=${opts.token}`,
    getTokenLast4: () => opts.token.slice(-4),
    get: (prKey: string) => (opts.session && prKey === opts.session.prKey ? opts.session : undefined),
  };
}

describe('mountEvents', () => {
  it('returns 400 when ?session query param is missing', async () => {
    const manager = buildManager({ token: 'secret', port: 8080 });
    const app = new Hono();
    // Wire token middleware so we can test with cookie
    app.use('/api/*', tokenValidate(manager as any));
    mountEvents(app, manager as any);
    const res = await app.fetch(
      new Request('http://localhost/api/events', {
        headers: { Cookie: 'review_session=secret' },
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when session prKey is unknown', async () => {
    const manager = buildManager({ token: 'secret', port: 8080 });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    mountEvents(app, manager as any);
    const res = await app.fetch(
      new Request('http://localhost/api/events?session=unknown:key', {
        headers: { Cookie: 'review_session=secret' },
      })
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 with text/event-stream content-type for a valid session', async () => {
    const manager = buildManager({ token: 'secret', port: 8080, session: stubSession });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    mountEvents(app, manager as any);
    const res = await app.fetch(
      new Request('http://localhost/api/events?session=gh%3Aowner%2Frepo%231', {
        headers: { Cookie: 'review_session=secret' },
      })
    );
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toContain('text/event-stream');
  });

  it('first SSE chunk contains "event: snapshot"', async () => {
    const manager = buildManager({ token: 'secret', port: 8080, session: stubSession });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    mountEvents(app, manager as any);
    const res = await app.fetch(
      new Request('http://localhost/api/events?session=gh%3Aowner%2Frepo%231', {
        headers: { Cookie: 'review_session=secret' },
      })
    );
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    // Read chunks until we get the snapshot event or EOF
    for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read();
      if (value) fullText += decoder.decode(value, { stream: true });
      if (done || fullText.includes('event: snapshot')) break;
    }
    reader.cancel();
    expect(fullText).toContain('event: snapshot');
  });

  it('SSE data payload has type:"snapshot", session, launchUrl, tokenLast4 fields', async () => {
    const manager = buildManager({ token: 'mytoken', port: 8080, session: stubSession });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    mountEvents(app, manager as any);
    const res = await app.fetch(
      new Request('http://localhost/api/events?session=gh%3Aowner%2Frepo%231', {
        headers: { Cookie: 'review_session=mytoken' },
      })
    );
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read();
      if (value) fullText += decoder.decode(value, { stream: true });
      if (done || fullText.includes('data:')) break;
    }
    reader.cancel();

    // Extract the data: line from SSE
    const dataLine = fullText.split('\n').find(l => l.startsWith('data:'));
    expect(dataLine).toBeDefined();
    const json = JSON.parse(dataLine!.replace(/^data:\s*/, ''));
    expect(json.type).toBe('snapshot');
    expect(json.session).toBeDefined();
    expect(json.launchUrl).toBeDefined();
    expect(json.tokenLast4).toBeDefined();
    // Verify session shape has prKey
    expect(json.session.prKey).toBe('gh:owner/repo#1');
  });
});
