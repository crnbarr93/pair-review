import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../../session/manager.js';
import type { ReviewSession, SessionEvent, Thread } from '@shared/types';
import { registerDraftComment } from '../draft-comment.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function makeThread(threadId: string, lineId: string): Thread {
  return {
    threadId,
    lineId,
    path: 'src/auth.ts',
    line: 42,
    side: 'RIGHT',
    preExisting: false,
    turns: [{ author: 'llm', message: 'Test', createdAt: '2026-04-22T00:00:00Z' }],
    resolved: false,
    createdAt: '2026-04-22T00:00:00Z',
  };
}

function makeSession(threads?: Record<string, Thread>): ReviewSession {
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
    threads: threads ?? {},
  };
}

function extractHandler(mcp: McpServer): ToolHandler {
  const calls = (mcp.registerTool as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls[calls.length - 1][2] as ToolHandler;
}

let handler: ToolHandler;
let sessions: Map<string, ReviewSession>;
let appliedEvents: { prKey: string; event: SessionEvent }[];

beforeEach(() => {
  sessions = new Map<string, ReviewSession>();
  appliedEvents = [];

  const manager = {
    get: (key: string) => sessions.get(key),
    applyEvent: vi.fn(async (prKey: string, event: SessionEvent) => {
      appliedEvents.push({ prKey, event });
      const s = sessions.get(prKey)!;
      if (event.type === 'thread.draftSet') {
        const threads = { ...s.threads };
        threads[event.threadId] = { ...threads[event.threadId], draftBody: event.body };
        const updated = { ...s, threads };
        sessions.set(prKey, updated);
        return updated;
      }
      return s;
    }),
  } as unknown as SessionManager;

  const mcp = { registerTool: vi.fn() } as unknown as McpServer;
  registerDraftComment(mcp, manager);
  handler = extractHandler(mcp);
});

describe('draft_comment', () => {
  it("registers tool named 'draft_comment'", () => {
    const mcp = { registerTool: vi.fn() } as unknown as McpServer;
    const mgr = { get: vi.fn(), applyEvent: vi.fn() } as unknown as SessionManager;
    registerDraftComment(mcp, mgr);
    const calls = (mcp.registerTool as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls[0][0]).toBe('draft_comment');
  });

  it('returns isError when session not found', async () => {
    // No sessions set
    const res = await handler({ prKey: 'nonexistent', threadId: 'th_abc', body: 'Draft text' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('session not found');
  });

  it('returns isError when threadId not found', async () => {
    sessions.set('pr-1', makeSession({}));
    const res = await handler({ prKey: 'pr-1', threadId: 'th_missing', body: 'Draft text' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('threadId');
    expect(res.content[0].text).toContain('th_missing');
  });

  it('sets draft body via applyEvent on valid input', async () => {
    sessions.set('pr-1', makeSession({ th_abc: makeThread('th_abc', 'f1:h0:l2') }));
    const res = await handler({ prKey: 'pr-1', threadId: 'th_abc', body: 'Draft text' });
    expect(res.isError).toBeUndefined();
    expect(appliedEvents).toHaveLength(1);
    expect(appliedEvents[0].event.type).toBe('thread.draftSet');
    if (appliedEvents[0].event.type === 'thread.draftSet') {
      expect(appliedEvents[0].event.threadId).toBe('th_abc');
      expect(appliedEvents[0].event.body).toBe('Draft text');
    }
    expect(appliedEvents[0].prKey).toBe('pr-1');
  });

  it('ack text mentions thread ID', async () => {
    sessions.set('pr-1', makeSession({ th_abc: makeThread('th_abc', 'f1:h0:l2') }));
    const res = await handler({ prKey: 'pr-1', threadId: 'th_abc', body: 'Draft text' });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain('th_abc');
  });
});
