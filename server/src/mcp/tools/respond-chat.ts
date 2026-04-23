import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';

const Input = z.object({
  message: z.string().min(1).max(8000),
});

const DESCRIPTION = `Send a chat response to the browser's chat panel. The message appears as an LLM-authored message in the conversation. Use this after receiving a { type: "chat" } request from await_user_request. The message is persisted in session state and survives browser refresh.`;

export function registerRespondChat(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'respond_chat',
    { title: 'Respond in Chat', description: DESCRIPTION, inputSchema: Input.shape },
    async ({ message }) => {
      const prKey = manager.getActivePrKey();
      if (!prKey) {
        return {
          content: [{ type: 'text' as const, text: 'No active session. Call start_review first.' }],
          isError: true as const,
        };
      }

      try {
        await manager.applyEvent(prKey, {
          type: 'chat.llmMessage',
          message: message as string,
          timestamp: new Date().toISOString(),
        });
        return {
          content: [{ type: 'text' as const, text: 'Chat response sent.' }],
        };
      } catch (err) {
        logger.error('respond_chat failed', err);
        return {
          content: [{ type: 'text' as const, text: `respond_chat failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true as const,
        };
      }
    }
  );
}
