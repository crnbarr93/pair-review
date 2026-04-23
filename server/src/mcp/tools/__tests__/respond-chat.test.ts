import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../../session/manager.js';
import type { SessionEvent } from '@shared/types';
import { registerRespondChat } from '../respond-chat.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

function extractHandler(mcp: McpServer): ToolHandler {
  const calls = (mcp.registerTool as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls[calls.length - 1][2] as ToolHandler;
}

describe('respond_chat', () => {
  it("registers tool named 'respond_chat'", () => {
    const mcp = { registerTool: vi.fn() } as unknown as McpServer;
    const manager = {
      getActivePrKey: vi.fn(),
      applyEvent: vi.fn(),
    } as unknown as SessionManager;
    registerRespondChat(mcp, manager);
    const calls = (mcp.registerTool as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls[0][0]).toBe('respond_chat');
  });

  it('returns isError when no active session (getActivePrKey returns null)', async () => {
    const manager = {
      getActivePrKey: vi.fn(() => null),
      applyEvent: vi.fn(),
    } as unknown as SessionManager;
    const mcp = { registerTool: vi.fn() } as unknown as McpServer;
    registerRespondChat(mcp, manager);
    const h = extractHandler(mcp);

    const res = await h({ message: 'Hello' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('No active session');
  });

  it('calls applyEvent with chat.llmMessage event containing the message', async () => {
    const applied: { prKey: string; event: SessionEvent }[] = [];
    const manager = {
      getActivePrKey: vi.fn(() => 'gh:test/repo#1'),
      applyEvent: vi.fn(async (prKey: string, event: SessionEvent) => {
        applied.push({ prKey, event });
      }),
    } as unknown as SessionManager;
    const mcp = { registerTool: vi.fn() } as unknown as McpServer;
    registerRespondChat(mcp, manager);
    const h = extractHandler(mcp);

    await h({ message: 'This looks good to me.' });

    expect(applied).toHaveLength(1);
    expect(applied[0].prKey).toBe('gh:test/repo#1');
    expect(applied[0].event.type).toBe('chat.llmMessage');
    if (applied[0].event.type === 'chat.llmMessage') {
      expect(applied[0].event.message).toBe('This looks good to me.');
      expect(typeof applied[0].event.timestamp).toBe('string');
    }
  });

  it("returns success text 'Chat response sent.'", async () => {
    const manager = {
      getActivePrKey: vi.fn(() => 'gh:test/repo#1'),
      applyEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionManager;
    const mcp = { registerTool: vi.fn() } as unknown as McpServer;
    registerRespondChat(mcp, manager);
    const h = extractHandler(mcp);

    const res = await h({ message: 'LGTM!' });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toBe('Chat response sent.');
  });

  it('returns isError when applyEvent throws', async () => {
    const manager = {
      getActivePrKey: vi.fn(() => 'gh:test/repo#1'),
      applyEvent: vi.fn().mockRejectedValue(new Error('disk full')),
    } as unknown as SessionManager;
    const mcp = { registerTool: vi.fn() } as unknown as McpServer;
    registerRespondChat(mcp, manager);
    const h = extractHandler(mcp);

    const res = await h({ message: 'test' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('respond_chat failed');
    expect(res.content[0].text).toContain('disk full');
  });
});
