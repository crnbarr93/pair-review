import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../../session/manager.js';
import type { DiffFile, DiffLine, Hunk, ReviewSession } from '@shared/types';
import { registerGetHunk } from '../get-hunk.js';

function makeLine(id: string, kind: DiffLine['kind'] = 'ctx', text = 'const x = 1;'): DiffLine {
  return { id, kind, side: 'RIGHT', fileLine: 1, diffPosition: 1, text };
}

function makeHunk(fileId: string, hunkIdx: number, lineCount: number): Hunk {
  const lines = Array.from({ length: lineCount }, (_, i) =>
    makeLine(`${fileId}:h${hunkIdx}:l${i}`, 'add', `line ${i} content here with some realistic padding text`)
  );
  return { id: `${fileId}:h${hunkIdx}`, header: `@@ -1,${lineCount} +1,${lineCount} @@`, lines };
}

function makeFile(id: string, path: string, hunks: Hunk[]): DiffFile {
  return {
    id,
    path,
    oldPath: undefined,
    status: 'modified',
    binary: false,
    hunks,
    generated: false,
  };
}

function makeSession(files: DiffFile[]): ReviewSession {
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
      additions: 0,
      deletions: 0,
      filesChanged: files.length,
      number: 1,
      owner: 'test',
      repo: 'repo',
    },
    diff: { files, totalHunks: files.reduce((n, f) => n + f.hunks.length, 0) },
    shikiTokens: {},
    createdAt: '2026-04-20T00:00:00Z',
    headSha: 'bbb',
    error: null,
    lastEventId: 0,
  };
}

function fakeManager(sessions: Map<string, ReviewSession>): SessionManager {
  return { get: (key: string) => sessions.get(key) } as unknown as SessionManager;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function extractHandler(mcp: McpServer): ToolHandler {
  const calls = (mcp.registerTool as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls[calls.length - 1][2] as ToolHandler;
}

let handler: ToolHandler;

const SMALL_HUNK = makeHunk('f1', 0, 10);
const BIG_HUNK = makeHunk('f1', 1, 200);
const FILE = makeFile('f1', 'src/main.ts', [SMALL_HUNK, BIG_HUNK]);

beforeEach(() => {
  const mcp = { registerTool: (() => {}) } as unknown as McpServer;
  mcp.registerTool = vi.fn(mcp.registerTool);

  const sessions = new Map<string, ReviewSession>();
  sessions.set('pr-1', makeSession([FILE]));
  registerGetHunk(mcp, fakeManager(sessions));
  handler = extractHandler(mcp);
});

describe('get_hunk', () => {
  it('returns a small hunk in one page with no cursor needed', async () => {
    const res = await handler({ prKey: 'pr-1', hunkId: 'f1:h0' });
    const body = JSON.parse(res.content[0].text);
    expect(body.lines).toHaveLength(10);
    expect(body.nextCursor).toBeNull();
    expect(body.totalLines).toBe(10);
    expect(body.fileId).toBe('f1');
    expect(body.path).toBe('src/main.ts');
  });

  it('paginates a 200-line hunk across multiple pages', async () => {
    const r1 = await handler({ prKey: 'pr-1', hunkId: 'f1:h1' });
    const b1 = JSON.parse(r1.content[0].text);
    expect(b1.lines).toHaveLength(60);
    expect(b1.nextCursor).not.toBeNull();
    expect(b1.totalLines).toBe(200);

    const r2 = await handler({ prKey: 'pr-1', hunkId: 'f1:h1', cursor: b1.nextCursor });
    const b2 = JSON.parse(r2.content[0].text);
    expect(b2.lines).toHaveLength(60);

    const r3 = await handler({ prKey: 'pr-1', hunkId: 'f1:h1', cursor: b2.nextCursor });
    const b3 = JSON.parse(r3.content[0].text);
    expect(b3.lines).toHaveLength(60);

    const r4 = await handler({ prKey: 'pr-1', hunkId: 'f1:h1', cursor: b3.nextCursor });
    const b4 = JSON.parse(r4.content[0].text);
    expect(b4.lines).toHaveLength(20);
    expect(b4.nextCursor).toBeNull();
  });

  it('preserves lineId on every returned line', async () => {
    const res = await handler({ prKey: 'pr-1', hunkId: 'f1:h0' });
    const body = JSON.parse(res.content[0].text);
    for (let i = 0; i < body.lines.length; i++) {
      expect(body.lines[i].id).toBe(`f1:h0:l${i}`);
    }
  });

  it('returns isError for unknown prKey', async () => {
    const res = await handler({ prKey: 'nope', hunkId: 'f1:h0' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('session');
  });

  it('returns isError for unknown fileId in hunkId', async () => {
    const res = await handler({ prKey: 'pr-1', hunkId: 'unknown-file:h0' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('fileId');
  });

  it('returns isError for out-of-range hunkIdx', async () => {
    const res = await handler({ prKey: 'pr-1', hunkId: 'f1:h99' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('hunkIdx');
  });

  it('returns isError for malformed hunkId', async () => {
    const res = await handler({ prKey: 'pr-1', hunkId: 'no-colon-h-here' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('malformed');
  });

  it('returns isError for malformed cursor', async () => {
    const res = await handler({ prKey: 'pr-1', hunkId: 'f1:h0', cursor: '!!bad!!' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('cursor');
  });

  it('keeps a 60-line page under the 10000-char budget', async () => {
    const res = await handler({ prKey: 'pr-1', hunkId: 'f1:h1' });
    expect(res.content[0].text.length).toBeLessThan(10000);
  });
});
