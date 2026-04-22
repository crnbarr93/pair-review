import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../../session/manager.js';
import type { ReviewSession, SessionEvent, DiffFile, DiffLine, Hunk } from '@shared/types';
import { registerSetWalkthrough, DESCRIPTION } from '../set-walkthrough.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function makeLine(id: string, kind: DiffLine['kind'] = 'add', fileLine = 1): DiffLine {
  return { id, kind, side: 'RIGHT', fileLine, diffPosition: 1, text: 'const x = 1;' };
}

function makeHunk(fileId: string, hunkIdx: number, lineCount: number): Hunk {
  const lines = Array.from({ length: lineCount }, (_, i) =>
    makeLine(`${fileId}:h${hunkIdx}:l${i}`, 'add', 40 + i)
  );
  return { id: `${fileId}:h${hunkIdx}`, header: '@@ -40,5 +40,5 @@', lines };
}

function makeFile(id: string, path: string): DiffFile {
  return {
    id,
    path,
    oldPath: undefined,
    status: 'modified',
    binary: false,
    hunks: [makeHunk(id, 0, 5)],
    generated: false,
  };
}

function makeSession(): ReviewSession {
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
      additions: 5,
      deletions: 0,
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
    if (event.type === 'walkthrough.set') {
      const updated = { ...s, walkthrough: event.walkthrough };
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
  registerSetWalkthrough(mcp, manager);
  handler = extractHandler(mcp);
});

describe('set_walkthrough', () => {
  it("registers tool named 'set_walkthrough'", () => {
    const mcp = { registerTool: vi.fn() } as unknown as McpServer;
    const manager = { get: vi.fn(), applyEvent: vi.fn() } as unknown as SessionManager;
    registerSetWalkthrough(mcp, manager);
    const calls = (mcp.registerTool as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls[0][0]).toBe('set_walkthrough');
  });

  it('returns isError when session not found', async () => {
    const res = await handler({
      prKey: 'nonexistent',
      steps: [{ hunkId: 'f1:h0', commentary: 'test' }],
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('session not found');
  });

  it('returns isError when hunkId does not resolve', async () => {
    const res = await handler({
      prKey: 'pr-1',
      steps: [{ hunkId: 'garbage:h99', commentary: 'test' }],
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('not found');
  });

  it('stores walkthrough via applyEvent on valid input', async () => {
    const res = await handler({
      prKey: 'pr-1',
      steps: [{ hunkId: 'f1:h0', commentary: 'Test commentary' }],
    });
    expect(res.isError).toBeUndefined();
    expect(applyEventMock).toHaveBeenCalledOnce();
    const [, event] = applyEventMock.mock.calls[0] as [string, { type: string; walkthrough: unknown }];
    expect(event.type).toBe('walkthrough.set');
    const wt = event.walkthrough as { steps: unknown[]; cursor: number; showAll: boolean };
    expect(wt.steps).toHaveLength(1);
    expect(wt.cursor).toBe(0);
    expect(wt.showAll).toBe(false);
    const step = wt.steps[0] as { stepNum: number; hunkId: string; commentary: string; status: string };
    expect(step.stepNum).toBe(1);
    expect(step.hunkId).toBe('f1:h0');
    expect(step.commentary).toBe('Test commentary');
    expect(step.status).toBe('pending');
  });

  it("sets all step statuses to 'pending'", async () => {
    // Build a session with 3 hunks
    const session = sessions.get('pr-1')!;
    const file = makeFile('f1', 'src/auth.ts');
    file.hunks = [makeHunk('f1', 0, 2), makeHunk('f1', 1, 2), makeHunk('f1', 2, 2)];
    sessions.set('pr-1', { ...session, diff: { files: [file], totalHunks: 3 } });

    const res = await handler({
      prKey: 'pr-1',
      steps: [
        { hunkId: 'f1:h0', commentary: 'Step one' },
        { hunkId: 'f1:h1', commentary: 'Step two' },
        { hunkId: 'f1:h2', commentary: 'Step three' },
      ],
    });
    expect(res.isError).toBeUndefined();
    const [, event] = applyEventMock.mock.calls[0] as [string, { type: string; walkthrough: { steps: { status: string }[] } }];
    expect(event.walkthrough.steps.every((s) => s.status === 'pending')).toBe(true);
  });

  it('returns ack text with step count and first hunkId', async () => {
    const res = await handler({
      prKey: 'pr-1',
      steps: [{ hunkId: 'f1:h0', commentary: 'Test commentary' }],
    });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain('1');
    expect(res.content[0].text).toContain('f1:h0');
  });

  it("DESCRIPTION mentions anchor discipline", () => {
    expect(DESCRIPTION).toContain('opaque value returned by list_files');
  });

  it("DESCRIPTION mentions order discipline", () => {
    expect(DESCRIPTION).toContain('prioritize changes');
  });
});
