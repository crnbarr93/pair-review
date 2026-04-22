import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../../session/manager.js';
import type { ReviewSession, SessionEvent, DiffFile, DiffLine, Hunk, Thread } from '@shared/types';
import { registerReplyInThread, DESCRIPTION } from '../reply-in-thread.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function makeLine(id: string, kind: DiffLine['kind'], fileLine = 1): DiffLine {
  return { id, kind, side: kind === 'del' ? 'LEFT' : 'RIGHT', fileLine, diffPosition: 1, text: 'const x = 1;' };
}

function makeHunkMixed(fileId: string, hunkIdx: number): Hunk {
  // 3 lines: add, context, del — so we can test all kinds
  return {
    id: `${fileId}:h${hunkIdx}`,
    header: '@@ -10,3 +10,3 @@',
    lines: [
      makeLine(`${fileId}:h${hunkIdx}:l0`, 'add', 10),
      makeLine(`${fileId}:h${hunkIdx}:l1`, 'context', 11),
      makeLine(`${fileId}:h${hunkIdx}:l2`, 'del', 12),
    ],
  };
}

function makeFile(id: string, path: string): DiffFile {
  return {
    id,
    path,
    oldPath: undefined,
    status: 'modified',
    binary: false,
    hunks: [makeHunkMixed(id, 0)],
    generated: false,
  };
}

function makeSession(threads?: Record<string, Thread>): ReviewSession {
  return {
    prKey: 'gh:test/repo#1',
    pr: {
      source: 'github',
      title: 'Test',
      description: '',
      author: 'alice',
      baseBranch: 'main',
      headBranch: 'feat',
      baseSha: 'aaa',
      headSha: 'bbb',
      additions: 3,
      deletions: 1,
      filesChanged: 1,
      number: 1,
      owner: 'test',
      repo: 'repo',
    },
    diff: { files: [makeFile('f1', 'src/auth.ts')], totalHunks: 1 },
    shikiTokens: {},
    createdAt: '2026-04-20T00:00:00Z',
    headSha: 'bbb',
    error: null,
    lastEventId: 0,
    threads,
  };
}

function extractHandler(mcp: McpServer): ToolHandler {
  const calls = (mcp.registerTool as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls[calls.length - 1][2] as ToolHandler;
}

let handler: ToolHandler;
let sessions: Map<string, ReviewSession>;
let applyEventMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessions = new Map<string, ReviewSession>();
  sessions.set('pr-1', makeSession());

  applyEventMock = vi.fn(async (prKey: string, event: SessionEvent) => {
    const s = sessions.get(prKey)!;
    if (event.type === 'thread.replyAdded') {
      const threads = { ...(s.threads ?? {}), [event.threadId]: event.thread };
      const updated = { ...s, threads };
      sessions.set(prKey, updated);
      return updated;
    }
    return s;
  });

  const manager = {
    get: (key: string) => sessions.get(key),
    applyEvent: applyEventMock,
  } as unknown as SessionManager;

  const mcp = { registerTool: vi.fn() } as unknown as McpServer;
  registerReplyInThread(mcp, manager);
  handler = extractHandler(mcp);
});

describe('reply_in_thread', () => {
  it("registers tool named 'reply_in_thread'", () => {
    const mcp = { registerTool: vi.fn() } as unknown as McpServer;
    const manager = { get: vi.fn(), applyEvent: vi.fn() } as unknown as SessionManager;
    registerReplyInThread(mcp, manager);
    const calls = (mcp.registerTool as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls[0][0]).toBe('reply_in_thread');
  });

  it('returns isError when session not found', async () => {
    const res = await handler({
      prKey: 'nonexistent',
      lineId: 'f1:h0:l0',
      message: 'hello',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('session not found');
  });

  it('returns isError when neither lineId nor threadId supplied', async () => {
    const res = await handler({
      prKey: 'pr-1',
      message: 'hello',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('lineId');
  });

  it('creates new thread on valid lineId (add line)', async () => {
    const res = await handler({
      prKey: 'pr-1',
      lineId: 'f1:h0:l0',  // 'add' kind line
      message: 'This looks good',
    });
    expect(res.isError).toBeUndefined();
    expect(applyEventMock).toHaveBeenCalledOnce();

    const [, event] = applyEventMock.mock.calls[0] as [string, { type: string; threadId: string; thread: Thread }];
    expect(event.type).toBe('thread.replyAdded');
    expect(event.threadId).toMatch(/^th_/);
    expect(event.thread.threadId).toBe(event.threadId);
    expect(event.thread.turns).toHaveLength(1);
    expect(event.thread.turns[0].author).toBe('llm');
    expect(event.thread.turns[0].message).toBe('This looks good');
  });

  it('returns isError when lineId does not resolve', async () => {
    const res = await handler({
      prKey: 'pr-1',
      lineId: 'f999:h0:l0',
      message: 'hello',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('does not resolve');
  });

  it('returns isError on context line without preExisting', async () => {
    const res = await handler({
      prKey: 'pr-1',
      lineId: 'f1:h0:l1',  // 'context' kind line
      message: 'This is a pre-existing issue',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('unchanged context line');
  });

  it('accepts context line with preExisting: true', async () => {
    const res = await handler({
      prKey: 'pr-1',
      lineId: 'f1:h0:l1',  // 'context' kind line
      message: 'This is a pre-existing issue',
      preExisting: true,
    });
    expect(res.isError).toBeUndefined();
    const [, event] = applyEventMock.mock.calls[0] as [string, { type: string; threadId: string; thread: Thread }];
    expect(event.thread.preExisting).toBe(true);
  });

  it('replies to existing thread', async () => {
    // Pre-seed a thread in the session
    const existingThread: Thread = {
      threadId: 'th_existing123',
      lineId: 'f1:h0:l0',
      path: 'src/auth.ts',
      line: 10,
      side: 'RIGHT',
      preExisting: false,
      turns: [{ author: 'llm', message: 'First message', createdAt: '2026-04-20T00:00:00Z' }],
      resolved: false,
      createdAt: '2026-04-20T00:00:00Z',
    };
    sessions.set('pr-1', makeSession({ 'th_existing123': existingThread }));

    const res = await handler({
      prKey: 'pr-1',
      threadId: 'th_existing123',
      message: 'Second message',
    });
    expect(res.isError).toBeUndefined();
    const [, event] = applyEventMock.mock.calls[0] as [string, { type: string; threadId: string; thread: Thread }];
    expect(event.type).toBe('thread.replyAdded');
    expect(event.thread.turns).toHaveLength(2);
  });

  it('returns isError when threadId not found', async () => {
    const res = await handler({
      prKey: 'pr-1',
      threadId: 'th_doesnotexist',
      message: 'hello',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('not found');
  });

  it("generated threadId has prefix 'th_' and total length 13", async () => {
    const res = await handler({
      prKey: 'pr-1',
      lineId: 'f1:h0:l0',
      message: 'check ID format',
    });
    expect(res.isError).toBeUndefined();
    const [, event] = applyEventMock.mock.calls[0] as [string, { type: string; threadId: string; thread: Thread }];
    expect(event.threadId).toMatch(/^th_/);
    // th_ (3) + nanoid(10) = 13 characters
    expect(event.threadId).toHaveLength(13);
  });

  it('DESCRIPTION mentions preExisting gate', () => {
    expect(DESCRIPTION).toContain('preExisting');
  });

  it('DESCRIPTION mentions anchor discipline', () => {
    expect(DESCRIPTION).toContain('opaque IDs');
  });
});
