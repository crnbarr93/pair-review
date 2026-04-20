import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../../session/manager.js';
import type { DiffFile, DiffLine, ReviewSession } from '@shared/types';
import { registerListFiles } from '../list-files.js';

function makeLine(id: string, kind: DiffLine['kind'] = 'ctx'): DiffLine {
  return { id, kind, side: 'BOTH', fileLine: 1, diffPosition: 1, text: 'x' };
}

function makeFile(id: string, path: string, generated: boolean, lineKinds?: DiffLine['kind'][]): DiffFile {
  const lines = (lineKinds ?? ['ctx']).map((k, i) => makeLine(`${id}:h0:l${i}`, k));
  return {
    id,
    path,
    oldPath: undefined,
    status: 'modified',
    binary: false,
    hunks: [{ id: `${id}:h0`, header: '@@ -1 +1 @@', lines }],
    generated,
  };
}

function makeSession(files: DiffFile[]): ReviewSession {
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

let mcp: McpServer;
let handler: ToolHandler;

const FILES_5 = [
  makeFile('f0', 'src/a.ts', false, ['add', 'add']),
  makeFile('f1', 'package-lock.json', true),
  makeFile('f2', 'src/b.ts', false, ['del']),
  makeFile('f3', 'yarn.lock', true),
  makeFile('f4', 'src/c.ts', false, ['add', 'del', 'ctx']),
];

beforeEach(() => {
  mcp = { registerTool: (() => {}) } as unknown as McpServer;
  mcp.registerTool = vi.fn(mcp.registerTool);

  const sessions = new Map<string, ReviewSession>();
  sessions.set('pr-1', makeSession(FILES_5));
  registerListFiles(mcp, fakeManager(sessions));
  handler = extractHandler(mcp);
});

describe('list_files', () => {
  it('returns all non-generated files by default', async () => {
    const res = await handler({ prKey: 'pr-1' });
    const body = JSON.parse(res.content[0].text);
    expect(body.files).toHaveLength(3);
    expect(body.totalFiles).toBe(3);
    expect(body.excludedCount).toBe(2);
    expect(body.nextCursor).toBeNull();
    expect(body.files[0].fileId).toBe('f0');
  });

  it('includes generated files when includeExcluded=true', async () => {
    const res = await handler({ prKey: 'pr-1', includeExcluded: true });
    const body = JSON.parse(res.content[0].text);
    expect(body.files).toHaveLength(5);
    expect(body.excludedCount).toBe(0);
  });

  it('computes additions/deletions from hunk lines', async () => {
    const res = await handler({ prKey: 'pr-1', includeExcluded: true });
    const body = JSON.parse(res.content[0].text);
    const f0 = body.files.find((f: { fileId: string }) => f.fileId === 'f0');
    expect(f0.additions).toBe(2);
    expect(f0.deletions).toBe(0);
  });

  it('paginates with cursor', async () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      makeFile(`f${i}`, `src/file${i}.ts`, false)
    );
    const sessions = new Map<string, ReviewSession>();
    sessions.set('big', makeSession(many));
    const mcp2 = { registerTool: (() => {}) } as unknown as McpServer;
    mcp2.registerTool = vi.fn(mcp2.registerTool);
    registerListFiles(mcp2, fakeManager(sessions));
    const h2 = extractHandler(mcp2);

    const r1 = await h2({ prKey: 'big', limit: 10 });
    const b1 = JSON.parse(r1.content[0].text);
    expect(b1.files).toHaveLength(10);
    expect(b1.nextCursor).not.toBeNull();
    expect(b1.totalFiles).toBe(50);

    const r2 = await h2({ prKey: 'big', limit: 10, cursor: b1.nextCursor });
    const b2 = JSON.parse(r2.content[0].text);
    expect(b2.files).toHaveLength(10);
    expect(b2.files[0].fileId).toBe('f10');
  });

  it('returns isError for unknown prKey', async () => {
    const res = await handler({ prKey: 'nonexistent' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('session');
  });

  it('returns isError for malformed cursor', async () => {
    const res = await handler({ prKey: 'pr-1', cursor: '!!!garbage!!!' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('cursor');
  });

  it('returns isError for out-of-range cursor', async () => {
    const validButPastEnd = Buffer.from('999', 'utf8').toString('base64');
    const res = await handler({ prKey: 'pr-1', cursor: validButPastEnd });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('past the end');
  });

  it('keeps a 30-file page under the 6000-char token budget', async () => {
    const files30 = Array.from({ length: 30 }, (_, i) =>
      makeFile(`file-${i}`, `src/components/deeply/nested/path/Component${i}.tsx`, false, ['add', 'del', 'ctx'])
    );
    const sessions = new Map<string, ReviewSession>();
    sessions.set('big30', makeSession(files30));
    const mcp3 = { registerTool: (() => {}) } as unknown as McpServer;
    mcp3.registerTool = vi.fn(mcp3.registerTool);
    registerListFiles(mcp3, fakeManager(sessions));
    const h3 = extractHandler(mcp3);

    const res = await h3({ prKey: 'big30', limit: 30 });
    expect(res.content[0].text.length).toBeLessThan(6000);
  });
});
