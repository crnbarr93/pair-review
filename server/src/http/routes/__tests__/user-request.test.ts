import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { tokenValidate } from '../../middleware/token-validate.js';
import type { ReviewSession, SessionEvent, DiffModel } from '@shared/types';

// Mock nanoid to produce predictable thread IDs
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'testid12345'),
}));

// Mock resolveLineIdExtended
vi.mock('../../../mcp/tools/resolve-ids.js', () => ({
  resolveLineIdExtended: vi.fn(),
}));

import { resolveLineIdExtended } from '../../../mcp/tools/resolve-ids.js';
const resolveLineIdMock = resolveLineIdExtended as ReturnType<typeof vi.fn>;

function makeDiff(): DiffModel {
  return {
    files: [
      {
        id: 'f1',
        path: 'src/auth.ts',
        binary: false,
        hunks: [
          {
            header: '@@ -1,3 +1,4 @@',
            lines: [
              { id: 'f1:h0:l0', kind: 'add', fileLine: 10, side: 'RIGHT', content: '+line' },
            ],
          },
        ],
      },
    ],
    totalHunks: 1,
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
      baseSha: 'aaa',
      headSha: 'bbb',
      additions: 5,
      deletions: 1,
      filesChanged: 1,
      number: 1,
      owner: 'owner',
      repo: 'repo',
    },
    diff: makeDiff(),
    shikiTokens: {},
    createdAt: '2026-04-23T00:00:00Z',
    headSha: 'bbb',
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

function makeQueueManager(opts: { pendingCount?: number } = {}) {
  const enqueueSpy = vi.fn();
  const queue = {
    enqueue: enqueueSpy,
    pendingCount: opts.pendingCount ?? 0,
    waitForRequest: vi.fn(),
  };
  const getQueueSpy = vi.fn().mockReturnValue(queue);
  const queueManager = { getQueue: getQueueSpy };
  return { queueManager, enqueueSpy, getQueueSpy, queue };
}

async function buildApp(opts: {
  token: string;
  session?: ReviewSession | null;
  pendingCount?: number;
}) {
  const { mountUserRequest } = await import('../user-request.js');
  const built = buildManager(opts);
  const { queueManager, enqueueSpy, getQueueSpy, queue } = makeQueueManager({
    pendingCount: opts.pendingCount ?? 0,
  });
  const app = new Hono();
  app.use('/api/*', tokenValidate(built.manager as never));
  mountUserRequest(app, built.manager as never, queueManager as never);
  return { app, ...built, enqueueSpy, getQueueSpy, queue };
}

function authedHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Cookie: `review_session=${token}`,
    'X-Review-Token': token,
  };
}

describe('POST /api/user-request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 for invalid body (missing type)', async () => {
    const { app } = await buildApp({ token: 'tok', session: makeSession() });
    const res = await app.fetch(
      new Request('http://localhost/api/user-request', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({ prKey: 'gh:owner/repo#1' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown type value', async () => {
    const { app } = await buildApp({ token: 'tok', session: makeSession() });
    const res = await app.fetch(
      new Request('http://localhost/api/user-request', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({ prKey: 'gh:owner/repo#1', type: 'unknown_type' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for strict schema violation (unknown field)', async () => {
    const { app } = await buildApp({ token: 'tok', session: makeSession() });
    const res = await app.fetch(
      new Request('http://localhost/api/user-request', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          type: 'chat',
          unknownField: 'bad',
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown session', async () => {
    const { app } = await buildApp({ token: 'tok', session: null });
    const res = await app.fetch(
      new Request('http://localhost/api/user-request', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({ prKey: 'gh:unknown#99', type: 'chat', payload: { message: 'hi' } }),
      })
    );
    expect(res.status).toBe(404);
  });

  it('type "chat": fires chat.userMessage event and enqueues', async () => {
    const { app, appliedEvents, enqueueSpy } = await buildApp({
      token: 'tok',
      session: makeSession(),
    });

    const res = await app.fetch(
      new Request('http://localhost/api/user-request', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          type: 'chat',
          payload: { message: 'What does this do?' },
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // chat.userMessage event must be applied
    const chatEvent = appliedEvents.find((e) => e.event.type === 'chat.userMessage');
    expect(chatEvent).toBeDefined();
    if (chatEvent?.event.type === 'chat.userMessage') {
      expect(chatEvent.event.message).toBe('What does this do?');
    }

    // Also enqueued for LLM pickup
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chat' })
    );
  });

  it('type "run_self_review": enqueues without firing chat event', async () => {
    const { app, appliedEvents, enqueueSpy } = await buildApp({
      token: 'tok',
      session: makeSession(),
    });

    const res = await app.fetch(
      new Request('http://localhost/api/user-request', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({ prKey: 'gh:owner/repo#1', type: 'run_self_review' }),
      })
    );

    expect(res.status).toBe(200);
    const chatEvent = appliedEvents.find((e) => e.event.type === 'chat.userMessage');
    expect(chatEvent).toBeUndefined();
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'run_self_review' })
    );
  });

  it('type "inline_comment" with valid lineId + isClaudeTagged=true: fires thread.userStarted and enqueues', async () => {
    resolveLineIdMock.mockReturnValue({
      path: 'src/auth.ts',
      line: 10,
      side: 'RIGHT',
      lineKind: 'add',
    });

    const { app, appliedEvents, enqueueSpy } = await buildApp({
      token: 'tok',
      session: makeSession(),
    });

    const res = await app.fetch(
      new Request('http://localhost/api/user-request', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          type: 'inline_comment',
          payload: {
            lineId: 'f1:h0:l0',
            message: '@claude explain this',
            isClaudeTagged: true,
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const threadEvent = appliedEvents.find((e) => e.event.type === 'thread.userStarted');
    expect(threadEvent).toBeDefined();
    if (threadEvent?.event.type === 'thread.userStarted') {
      expect(threadEvent.event.lineId).toBe('f1:h0:l0');
      expect(threadEvent.event.message).toBe('@claude explain this');
      expect(threadEvent.event.isClaudeTagged).toBe(true);
      expect(threadEvent.event.path).toBe('src/auth.ts');
      expect(threadEvent.event.line).toBe(10);
      expect(threadEvent.event.side).toBe('RIGHT');
    }

    // isClaudeTagged=true: should enqueue for LLM
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'inline_comment' })
    );
  });

  it('type "inline_comment" with isClaudeTagged=false: fires thread.userStarted but does NOT enqueue', async () => {
    resolveLineIdMock.mockReturnValue({
      path: 'src/auth.ts',
      line: 10,
      side: 'RIGHT',
      lineKind: 'add',
    });

    const { app, appliedEvents, enqueueSpy } = await buildApp({
      token: 'tok',
      session: makeSession(),
    });

    const res = await app.fetch(
      new Request('http://localhost/api/user-request', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          type: 'inline_comment',
          payload: {
            lineId: 'f1:h0:l0',
            message: 'just a note',
            isClaudeTagged: false,
          },
        }),
      })
    );

    expect(res.status).toBe(200);

    const threadEvent = appliedEvents.find((e) => e.event.type === 'thread.userStarted');
    expect(threadEvent).toBeDefined();

    // isClaudeTagged=false: must NOT enqueue
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it('type "inline_comment" with invalid lineId: returns 400', async () => {
    resolveLineIdMock.mockReturnValue(null);

    const { app } = await buildApp({ token: 'tok', session: makeSession() });

    const res = await app.fetch(
      new Request('http://localhost/api/user-request', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          type: 'inline_comment',
          payload: {
            lineId: 'bad:lineId',
            message: 'comment here',
          },
        }),
      })
    );

    expect(res.status).toBe(400);
  });

  it('type "inline_comment" missing lineId: returns 400', async () => {
    const { app } = await buildApp({ token: 'tok', session: makeSession() });

    const res = await app.fetch(
      new Request('http://localhost/api/user-request', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({
          prKey: 'gh:owner/repo#1',
          type: 'inline_comment',
          payload: { message: 'no lineId here' },
        }),
      })
    );

    expect(res.status).toBe(400);
  });

  it('fires request.queued event when queue already has pending items', async () => {
    const { app, appliedEvents } = await buildApp({
      token: 'tok',
      session: makeSession(),
      pendingCount: 2,
    });

    const res = await app.fetch(
      new Request('http://localhost/api/user-request', {
        method: 'POST',
        headers: authedHeaders('tok'),
        body: JSON.stringify({ prKey: 'gh:owner/repo#1', type: 'run_self_review' }),
      })
    );

    expect(res.status).toBe(200);
    const queuedEvent = appliedEvents.find((e) => e.event.type === 'request.queued');
    expect(queuedEvent).toBeDefined();
    if (queuedEvent?.event.type === 'request.queued') {
      expect(queuedEvent.event.requestType).toBe('run_self_review');
      expect(queuedEvent.event.position).toBe(2);
    }
  });
});
