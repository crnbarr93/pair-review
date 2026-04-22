import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../../session/manager.js';
import type { ReviewSession, SessionEvent, Thread } from '@shared/types';
import { registerSubmitReview } from '../submit-review.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

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
    prKey: 'gh:test/repo#1',
    pr: {
      source: 'github',
      title: 'Test PR',
      description: 'Test',
      author: 'alice',
      baseBranch: 'main',
      headBranch: 'feat',
      baseSha: 'aaa',
      headSha: 'bbb',
      additions: 10,
      deletions: 2,
      filesChanged: 1,
      number: 1,
      owner: 'test',
      repo: 'repo',
    },
    diff: { files: [], totalHunks: 0 },
    shikiTokens: {},
    createdAt: '2026-04-20T00:00:00Z',
    headSha: 'bbb',
    error: null,
    lastEventId: 0,
    threads: {},
    ...overrides,
  };
}

function extractHandler(mcp: McpServer): ToolHandler {
  const calls = (mcp.registerTool as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls[calls.length - 1][2] as ToolHandler;
}

let handler: ToolHandler;
let sessions: Map<string, ReviewSession>;
let appliedEvents: { prKey: string; event: SessionEvent }[];
let mcpInstance: McpServer;

beforeEach(() => {
  sessions = new Map<string, ReviewSession>();
  appliedEvents = [];

  const manager = {
    get: (key: string) => sessions.get(key),
    applyEvent: vi.fn(async (prKey: string, event: SessionEvent) => {
      appliedEvents.push({ prKey, event });
      return sessions.get(prKey)!;
    }),
  } as unknown as SessionManager;

  mcpInstance = { registerTool: vi.fn() } as unknown as McpServer;
  registerSubmitReview(mcpInstance, manager);
  handler = extractHandler(mcpInstance);
});

describe('submit_review', () => {
  it('is registered with tool name submit_review', () => {
    const calls = (mcpInstance.registerTool as unknown as { mock: { calls: unknown[][] } }).mock
      .calls;
    expect(calls[0][0]).toBe('submit_review');
  });

  it('returns isError when session not found', async () => {
    const res = await handler({
      prKey: 'gh:nonexistent/repo#999',
      body: 'Looks good',
      verdict: 'approve',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('session not found');
  });

  it('returns isError when submissionState.status is submitted (duplicate gate D-10)', async () => {
    sessions.set('gh:test/repo#1', makeSession({
      submissionState: {
        status: 'submitted',
        submissionId: 'abc123xyz',
        reviewId: 999,
        url: 'https://github.com/test/repo/pull/1#pullrequestreview-999',
      },
    }));
    const res = await handler({
      prKey: 'gh:test/repo#1',
      body: 'Looks good',
      verdict: 'approve',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Review already submitted');
    expect(res.content[0].text).toContain('abc123xyz');
  });

  it('returns isError for local prKey without exportPath', async () => {
    sessions.set('local:abc123', makeSession({ prKey: 'local:abc123' }));
    const res = await handler({
      prKey: 'local:abc123',
      body: 'Some review',
      verdict: 'comment',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('exportPath is required');
  });

  it('returns isError when body is empty AND no threads have draftBody', async () => {
    sessions.set('gh:test/repo#1', makeSession({
      threads: {
        't1': makeThread('t1'), // no draftBody
        't2': makeThread('t2', undefined), // also no draftBody
      },
    }));
    const res = await handler({
      prKey: 'gh:test/repo#1',
      body: '',
      verdict: 'request_changes',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('No review content');
  });

  it('calls manager.applyEvent with submission.proposed event on success (with body)', async () => {
    sessions.set('gh:test/repo#1', makeSession());
    const res = await handler({
      prKey: 'gh:test/repo#1',
      body: 'Overall this looks good but needs tests.',
      verdict: 'request_changes',
    });
    expect(res.isError).toBeUndefined();
    expect(appliedEvents).toHaveLength(1);
    const ev = appliedEvents[0];
    expect(ev.prKey).toBe('gh:test/repo#1');
    expect(ev.event.type).toBe('submission.proposed');
    if (ev.event.type === 'submission.proposed') {
      expect(ev.event.verdict).toBe('request_changes');
      expect(ev.event.body).toBe('Overall this looks good but needs tests.');
    }
  });

  it('succeeds when body is empty but at least one thread has draftBody', async () => {
    sessions.set('gh:test/repo#1', makeSession({
      threads: {
        't1': makeThread('t1', 'Please fix this null check'),
      },
    }));
    const res = await handler({
      prKey: 'gh:test/repo#1',
      body: '',
      verdict: 'comment',
    });
    expect(res.isError).toBeUndefined();
    expect(appliedEvents).toHaveLength(1);
    expect(appliedEvents[0].event.type).toBe('submission.proposed');
  });

  it('returns success message mentioning awaiting user confirmation', async () => {
    sessions.set('gh:test/repo#1', makeSession());
    const res = await handler({
      prKey: 'gh:test/repo#1',
      body: 'The implementation looks solid.',
      verdict: 'approve',
    });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain('awaiting user confirmation');
    expect(res.content[0].text).toContain('browser');
  });

  it('returns isError when handler throws an unexpected error', async () => {
    const throwingManager = {
      get: () => makeSession(),
      applyEvent: vi.fn().mockRejectedValue(new Error('Disk write failed')),
    } as unknown as SessionManager;

    sessions.set('gh:test/repo#1', makeSession());
    const throwingMcp = { registerTool: vi.fn() } as unknown as McpServer;
    registerSubmitReview(throwingMcp, throwingManager);
    const throwingHandler = extractHandler(throwingMcp);

    const res = await throwingHandler({
      prKey: 'gh:test/repo#1',
      body: 'Some review',
      verdict: 'approve',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('submit_review failed');
    expect(res.content[0].text).toContain('Disk write failed');
  });
});
