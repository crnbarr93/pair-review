import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../../session/manager.js';
import type { RequestQueueManager } from '../../../session/request-queue.js';
import type { SessionEvent } from '@shared/types';
import { registerAwaitUserRequest } from '../await-user-request.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

function extractHandler(mcp: McpServer): ToolHandler {
  const calls = (mcp.registerTool as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls[calls.length - 1][2] as ToolHandler;
}

function makeQueueManager(opts: {
  waitResult: { type: string; payload?: Record<string, unknown> } | null;
}): { queueManager: RequestQueueManager; waitForRequestMock: ReturnType<typeof vi.fn>; enqueueMock: ReturnType<typeof vi.fn> } {
  const waitForRequestMock = vi.fn().mockResolvedValue(opts.waitResult);
  const enqueueMock = vi.fn();
  const queueManager = {
    getQueue: vi.fn().mockReturnValue({
      waitForRequest: waitForRequestMock,
      enqueue: enqueueMock,
      pendingCount: 0,
    }),
  } as unknown as RequestQueueManager;
  return { queueManager, waitForRequestMock, enqueueMock };
}

let handler: ToolHandler;
let appliedEvents: { prKey: string; event: SessionEvent }[];
let activePrKey: string | null;

beforeEach(() => {
  appliedEvents = [];
  activePrKey = 'gh:test/repo#1';

  const manager = {
    getActivePrKey: vi.fn(() => activePrKey),
    applyEvent: vi.fn(async (prKey: string, event: SessionEvent) => {
      appliedEvents.push({ prKey, event });
    }),
  } as unknown as SessionManager;

  const { queueManager } = makeQueueManager({ waitResult: null });
  const mcp = { registerTool: vi.fn() } as unknown as McpServer;
  registerAwaitUserRequest(mcp, manager, queueManager);
  handler = extractHandler(mcp);
});

describe('await_user_request', () => {
  it("registers tool named 'await_user_request'", () => {
    const mcp = { registerTool: vi.fn() } as unknown as McpServer;
    const manager = {
      getActivePrKey: vi.fn(),
      applyEvent: vi.fn(),
    } as unknown as SessionManager;
    const { queueManager } = makeQueueManager({ waitResult: null });
    registerAwaitUserRequest(mcp, manager, queueManager);
    const calls = (mcp.registerTool as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls[0][0]).toBe('await_user_request');
  });

  it('returns isError when no active session (getActivePrKey returns null)', async () => {
    activePrKey = null;

    const manager = {
      getActivePrKey: vi.fn(() => null),
      applyEvent: vi.fn(),
    } as unknown as SessionManager;

    const { queueManager } = makeQueueManager({ waitResult: null });
    const mcp = { registerTool: vi.fn() } as unknown as McpServer;
    registerAwaitUserRequest(mcp, manager, queueManager);
    const h = extractHandler(mcp);

    const res = await h({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('No active session');
  });

  it('fires request.processing after dequeuing a request (not on timeout)', async () => {
    const applied: { prKey: string; event: SessionEvent }[] = [];
    const manager = {
      getActivePrKey: vi.fn(() => 'gh:test/repo#1'),
      applyEvent: vi.fn(async (prKey: string, event: SessionEvent) => {
        applied.push({ prKey, event });
      }),
    } as unknown as SessionManager;

    // With a real request: should fire request.processing
    const { queueManager: qm1 } = makeQueueManager({ waitResult: { type: 'chat', payload: { message: 'hi' } } });
    const mcp1 = { registerTool: vi.fn() } as unknown as McpServer;
    registerAwaitUserRequest(mcp1, manager, qm1);
    const h1 = extractHandler(mcp1);
    await h1({});
    expect(applied.length).toBe(1);
    expect(applied[0].event.type).toBe('request.processing');
    expect(applied[0].prKey).toBe('gh:test/repo#1');

    // With timeout (null): should NOT fire request.processing
    applied.length = 0;
    const { queueManager: qm2 } = makeQueueManager({ waitResult: null });
    const mcp2 = { registerTool: vi.fn() } as unknown as McpServer;
    registerAwaitUserRequest(mcp2, manager, qm2);
    const h2 = extractHandler(mcp2);
    await h2({});
    expect(applied.length).toBe(0);
  });

  it('returns { type: "no_request" } when waitForRequest returns null (timeout)', async () => {
    const manager = {
      getActivePrKey: vi.fn(() => 'gh:test/repo#1'),
      applyEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionManager;

    const { queueManager } = makeQueueManager({ waitResult: null });
    const mcp = { registerTool: vi.fn() } as unknown as McpServer;
    registerAwaitUserRequest(mcp, manager, queueManager);
    const h = extractHandler(mcp);

    const res = await h({});
    expect(res.isError).toBeUndefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.type).toBe('no_request');
  });

  it('returns the request payload when waitForRequest resolves with a request', async () => {
    const manager = {
      getActivePrKey: vi.fn(() => 'gh:test/repo#1'),
      applyEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionManager;

    const { queueManager } = makeQueueManager({
      waitResult: { type: 'chat', payload: { message: 'Hello!' } },
    });
    const mcp = { registerTool: vi.fn() } as unknown as McpServer;
    registerAwaitUserRequest(mcp, manager, queueManager);
    const h = extractHandler(mcp);

    const res = await h({});
    expect(res.isError).toBeUndefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.type).toBe('chat');
    expect(parsed.payload).toEqual({ message: 'Hello!' });
  });

  it('returns run_self_review request type when queued', async () => {
    const manager = {
      getActivePrKey: vi.fn(() => 'gh:test/repo#1'),
      applyEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionManager;

    const { queueManager } = makeQueueManager({
      waitResult: { type: 'run_self_review' },
    });
    const mcp = { registerTool: vi.fn() } as unknown as McpServer;
    registerAwaitUserRequest(mcp, manager, queueManager);
    const h = extractHandler(mcp);

    const res = await h({});
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.type).toBe('run_self_review');
    expect(parsed.payload).toBeNull();
  });
});
