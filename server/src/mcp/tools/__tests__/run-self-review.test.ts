import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../../session/manager.js';
import type { ReviewSession, SessionEvent, DiffFile, DiffLine, Hunk } from '@shared/types';
import { registerRunSelfReview, DESCRIPTION } from '../run-self-review.js';

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

function validFinding(overrides?: Record<string, unknown>) {
  return {
    category: 'correctness',
    checklistItemId: 'c-01',
    severity: 'major',
    lineId: 'f1:h0:l2',
    title: 'Missing null check',
    rationale: 'verifyToken dereferences .payload without guard.',
    ...overrides,
  };
}

function validCoverage() {
  return {
    correctness: 'partial',
    security: 'pass',
    tests: 'fail',
    performance: 'pass',
    style: 'pass',
  };
}

function extractHandler(mcp: McpServer): ToolHandler {
  const calls = (mcp.registerTool as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls[calls.length - 1][2] as ToolHandler;
}

let handler: ToolHandler;
let sessions: Map<string, ReviewSession>;

beforeEach(() => {
  sessions = new Map<string, ReviewSession>();
  sessions.set('pr-1', makeSession());

  const manager = {
    get: (key: string) => sessions.get(key),
    applyEvent: vi.fn(async (prKey: string, event: SessionEvent) => {
      const s = sessions.get(prKey)!;
      if (event.type === 'selfReview.set') {
        const updated = { ...s, selfReview: event.selfReview };
        sessions.set(prKey, updated);
        return updated;
      }
      return s;
    }),
  } as unknown as SessionManager;

  const mcp = { registerTool: vi.fn() } as unknown as McpServer;
  registerRunSelfReview(mcp, manager);
  handler = extractHandler(mcp);
});

describe('run_self_review', () => {
  it('records findings with resolved path/line/side and default verdict', async () => {
    const res = await handler({
      prKey: 'pr-1',
      findings: [validFinding()],
      coverage: validCoverage(),
    });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain('Self-review recorded');
    expect(res.content[0].text).toContain('request_changes');

    const session = sessions.get('pr-1')!;
    expect(session.selfReview).toBeDefined();
    expect(session.selfReview!.verdict).toBe('request_changes');
    expect(session.selfReview!.findings).toHaveLength(1);

    const f = session.selfReview!.findings[0];
    expect(f.path).toBe('src/auth.ts');
    expect(f.line).toBe(42);
    expect(f.side).toBe('RIGHT');
    expect(f.lineId).toBe('f1:h0:l2');
    expect(f.id).toBeDefined();
  });

  it('defaults verdict to request_changes when omitted', async () => {
    const res = await handler({
      prKey: 'pr-1',
      findings: [validFinding()],
      coverage: validCoverage(),
    });
    expect(res.isError).toBeUndefined();
    const session = sessions.get('pr-1')!;
    expect(session.selfReview!.verdict).toBe('request_changes');
  });

  it('rejects >3 nits (nit cap)', async () => {
    const findings = Array.from({ length: 4 }, (_, i) =>
      validFinding({ severity: 'nit', lineId: `f1:h0:l${i}`, title: `Nit ${i}` })
    );
    const res = await handler({
      prKey: 'pr-1',
      findings,
      coverage: validCoverage(),
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text.toLowerCase()).toMatch(/nit|promote/);
  });

  it('accepts exactly 3 nits (boundary)', async () => {
    const findings = Array.from({ length: 3 }, (_, i) =>
      validFinding({ severity: 'nit', lineId: `f1:h0:l${i}`, title: `Nit ${i}` })
    );
    const res = await handler({
      prKey: 'pr-1',
      findings,
      coverage: validCoverage(),
    });
    expect(res.isError).toBeUndefined();
  });

  it('rejects freeform path:line as lineId (regex gate)', async () => {
    const res = await handler({
      prKey: 'pr-1',
      findings: [validFinding({ lineId: 'src/foo.ts:42' })],
      coverage: validCoverage(),
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text.toLowerCase()).toMatch(/lineid|invalid/);
  });

  it('rejects well-formed lineId that does not resolve', async () => {
    const res = await handler({
      prKey: 'pr-1',
      findings: [validFinding({ lineId: 'f999:h0:l0' })],
      coverage: validCoverage(),
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text.toLowerCase()).toMatch(/lineid|resolve|not found/);
  });

  it('rejects unknown checklistItemId', async () => {
    const res = await handler({
      prKey: 'pr-1',
      findings: [validFinding({ checklistItemId: 'c-99' })],
      coverage: validCoverage(),
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text.toLowerCase()).toMatch(/checklistitemid|checklist/);
  });

  it('returns isError for unknown prKey', async () => {
    const res = await handler({
      prKey: 'nonexistent',
      findings: [validFinding()],
      coverage: validCoverage(),
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('session');
  });

  it('replaces previous self-review atomically on second call', async () => {
    await handler({
      prKey: 'pr-1',
      findings: [validFinding({ title: 'First finding' })],
      coverage: validCoverage(),
      verdict: 'request_changes',
    });
    await handler({
      prKey: 'pr-1',
      findings: [validFinding({ title: 'Second finding', severity: 'minor' })],
      coverage: validCoverage(),
      verdict: 'comment',
    });

    const session = sessions.get('pr-1')!;
    expect(session.selfReview!.findings).toHaveLength(1);
    expect(session.selfReview!.findings[0].title).toBe('Second finding');
    expect(session.selfReview!.verdict).toBe('comment');
  });

  describe('description content', () => {
    it('contains adversarial framing keywords', () => {
      expect(DESCRIPTION.toLowerCase()).toContain('adversarial');
      expect(DESCRIPTION).toContain('request_changes');
      expect(DESCRIPTION.toLowerCase()).toContain('argue');
      expect(DESCRIPTION.toLowerCase()).toContain('nit');
    });

    it('contains checklist items', () => {
      expect(DESCRIPTION).toContain('c-01');
      expect(DESCRIPTION).toContain('s-01');
    });
  });
});
