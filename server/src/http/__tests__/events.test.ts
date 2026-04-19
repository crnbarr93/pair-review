import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { tokenValidate } from '../middleware/token-validate.js';
import { mountEvents } from '../routes/events.js';
import { SessionBus } from '../../session/bus.js';
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
  lastEventId: 0,
};

function buildManager(opts: { token: string; port: number; session?: ReviewSession; bus?: SessionBus }) {
  const baseUrl = `http://127.0.0.1:${opts.port}/?token=${opts.token}`;
  return {
    getSessionToken: () => opts.token,
    getHttpPort: () => opts.port,
    getLaunchUrl: () => baseUrl,
    sessionLaunchUrl: (prKey: string) => `${baseUrl}&session=${encodeURIComponent(prKey)}`,
    getTokenLast4: () => opts.token.slice(-4),
    get: (prKey: string) => (opts.session && prKey === opts.session.prKey ? opts.session : undefined),
    bus: opts.bus ?? new SessionBus(),
  };
}

/**
 * Read SSE frames from the response body until `stop` returns true or the reader
 * produces `done`. Aborts cleanly so the never-ending keep-alive loop doesn't hang tests.
 */
async function readFramesUntil(
  res: Response,
  stop: (fullText: string) => boolean,
  maxChunks = 20
): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  for (let i = 0; i < maxChunks; i++) {
    const { value, done } = await reader.read();
    if (value) fullText += decoder.decode(value, { stream: true });
    if (done || stop(fullText)) break;
  }
  await reader.cancel();
  return fullText;
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

describe('Phase 2 update fan-out and subscribe-before-snapshot', () => {
  it('snapshot-1: initial snapshot carries id: String(session.lastEventId)', async () => {
    const session = { ...stubSession, lastEventId: 7 };
    const manager = buildManager({ token: 'secret', port: 8080, session });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    mountEvents(app, manager as any);
    const res = await app.fetch(
      new Request('http://localhost/api/events?session=gh%3Aowner%2Frepo%231', {
        headers: { Cookie: 'review_session=secret' },
      })
    );
    const text = await readFramesUntil(res, (t) => t.includes('event: snapshot'));
    expect(text).toContain('event: snapshot');
    // id: 7 line should appear alongside the snapshot frame
    expect(text).toMatch(/id:\s*7/);
  });

  it('update-1: event: update fires after manager.bus.emit("session:updated")', async () => {
    const bus = new SessionBus();
    const session = { ...stubSession };
    const manager = buildManager({ token: 'secret', port: 8080, session, bus });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    mountEvents(app, manager as any);
    const res = await app.fetch(
      new Request('http://localhost/api/events?session=gh%3Aowner%2Frepo%231', {
        headers: { Cookie: 'review_session=secret' },
      })
    );
    // Start reading; then fire an update. Use async IIFE so the read happens concurrently.
    const emitted = { ...session, lastEventId: 1, viewBothMode: true };
    // Give the stream a microtask tick to set up the subscription, then emit.
    setTimeout(() => {
      bus.emit('session:updated', {
        id: 'gh:owner/repo#1',
        event: { type: 'session.viewBoth' },
        state: emitted,
      });
    }, 5);

    const text = await readFramesUntil(
      res,
      (t) => t.includes('event: update'),
      30
    );
    expect(text).toContain('event: update');
    // The update frame carries id:1 matching state.lastEventId
    expect(text).toMatch(/id:\s*1/);
    // Data payload is the UpdateMessage JSON envelope
    const lines = text.split('\n');
    const updateIdx = lines.findIndex((l) => l === 'event: update');
    expect(updateIdx).toBeGreaterThanOrEqual(0);
    // The data: line is within a few lines of event: update
    const nearbyData = lines.slice(updateIdx, updateIdx + 5).find((l) => l.startsWith('data:'));
    expect(nearbyData).toBeDefined();
    const payload = JSON.parse(nearbyData!.replace(/^data:\s*/, ''));
    expect(payload.type).toBe('update');
    expect(payload.event.type).toBe('session.viewBoth');
    expect(payload.state.lastEventId).toBe(1);
  });

  it('pitfall-E-1: subscribe-before-snapshot — updates buffered during the gap still arrive after snapshot', async () => {
    const bus = new SessionBus();
    const session = { ...stubSession, lastEventId: 0 };
    const manager = buildManager({ token: 'secret', port: 8080, session, bus });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    mountEvents(app, manager as any);

    // Hook the bus's on() to fire an emit synchronously when the SSE handler subscribes.
    // This simulates the race window: between "subscribed" and "snapshot written",
    // a mutation fires. The handler must buffer and replay it after the snapshot.
    const realOn = bus.on.bind(bus);
    let emittedOnce = false;
    bus.on = (event, listener) => {
      realOn(event, listener);
      if (!emittedOnce) {
        emittedOnce = true;
        // Schedule emit on next microtask so the on() call fully returns before
        // emit (more realistic than synchronous).
        queueMicrotask(() => {
          bus.emit('session:updated', {
            id: 'gh:owner/repo#1',
            event: { type: 'session.viewBoth' },
            state: { ...session, lastEventId: 1, viewBothMode: true },
          });
        });
      }
    };

    const res = await app.fetch(
      new Request('http://localhost/api/events?session=gh%3Aowner%2Frepo%231', {
        headers: { Cookie: 'review_session=secret' },
      })
    );

    const text = await readFramesUntil(
      res,
      (t) => t.includes('event: snapshot') && t.includes('event: update'),
      30
    );
    // Both frames must appear; snapshot FIRST (buffer-and-flush order)
    const snapIdx = text.indexOf('event: snapshot');
    const updIdx = text.indexOf('event: update');
    expect(snapIdx).toBeGreaterThanOrEqual(0);
    expect(updIdx).toBeGreaterThanOrEqual(0);
    expect(snapIdx).toBeLessThan(updIdx);
  });

  it('last-event-id-1: GET with Last-Event-ID header still produces a full snapshot (Phase 2 always re-sends)', async () => {
    const manager = buildManager({ token: 'secret', port: 8080, session: stubSession });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    mountEvents(app, manager as any);
    const res = await app.fetch(
      new Request('http://localhost/api/events?session=gh%3Aowner%2Frepo%231', {
        headers: { Cookie: 'review_session=secret', 'Last-Event-ID': '42' },
      })
    );
    const text = await readFramesUntil(res, (t) => t.includes('event: snapshot'));
    expect(text).toContain('event: snapshot');
  });
});
