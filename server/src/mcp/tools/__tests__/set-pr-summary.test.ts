import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../../session/manager.js';
import type { ReviewSession, PrSummary, SessionEvent } from '@shared/types';
import { registerSetPrSummary } from '../set-pr-summary.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function makeSession(): ReviewSession {
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
  };
}

function makeSummaryInput(overrides?: Partial<PrSummary>) {
  return {
    intent: 'bug-fix' as const,
    intentConfidence: 0.92,
    paraphrase: 'Author says: fix null deref in verifyToken.',
    keyChanges: ['Add null check before dereferencing user token'],
    riskAreas: ['Auth-middleware boundary'],
    generatedAt: '2026-04-20T01:00:00Z',
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

beforeEach(() => {
  sessions = new Map<string, ReviewSession>();
  sessions.set('pr-1', makeSession());
  appliedEvents = [];

  const manager = {
    get: (key: string) => sessions.get(key),
    applyEvent: vi.fn(async (prKey: string, event: SessionEvent) => {
      appliedEvents.push({ prKey, event });
      const s = sessions.get(prKey)!;
      if (event.type === 'summary.set') {
        const updated = { ...s, summary: event.summary };
        sessions.set(prKey, updated);
        return updated;
      }
      return s;
    }),
  } as unknown as SessionManager;

  const mcp = { registerTool: vi.fn() } as unknown as McpServer;
  registerSetPrSummary(mcp, manager);
  handler = extractHandler(mcp);
});

describe('set_pr_summary', () => {
  it('records a valid summary and returns an ack', async () => {
    const res = await handler({ prKey: 'pr-1', summary: makeSummaryInput() });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain('Summary recorded');
    expect(res.content[0].text).toContain('bug-fix');

    const session = sessions.get('pr-1')!;
    expect(session.summary?.intent).toBe('bug-fix');
    expect(session.summary?.paraphrase).toBe('Author says: fix null deref in verifyToken.');
  });

  it('applies atomic replace — second call overwrites first', async () => {
    await handler({ prKey: 'pr-1', summary: makeSummaryInput({ paraphrase: 'First version' }) });
    await handler({ prKey: 'pr-1', summary: makeSummaryInput({ paraphrase: 'Second version', intent: 'refactor' }) });

    const session = sessions.get('pr-1')!;
    expect(session.summary?.paraphrase).toBe('Second version');
    expect(session.summary?.intent).toBe('refactor');
    expect(appliedEvents).toHaveLength(2);
  });

  it('returns isError for unknown prKey', async () => {
    const res = await handler({ prKey: 'nonexistent', summary: makeSummaryInput() });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('session');
  });

  it('coerces missing generatedAt to a valid ISO string', async () => {
    const input = makeSummaryInput();
    delete (input as Record<string, unknown>).generatedAt;
    await handler({ prKey: 'pr-1', summary: input });

    const session = sessions.get('pr-1')!;
    expect(session.summary?.generatedAt).toBeDefined();
    expect(new Date(session.summary!.generatedAt).toISOString()).toBe(session.summary!.generatedAt);
  });

  it('passes applyEvent the summary.set event type', async () => {
    await handler({ prKey: 'pr-1', summary: makeSummaryInput() });
    expect(appliedEvents).toHaveLength(1);
    expect(appliedEvents[0].event.type).toBe('summary.set');
    expect(appliedEvents[0].prKey).toBe('pr-1');
  });
});
