import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import type { RequestQueueManager } from '../../session/request-queue.js';
import { logger } from '../../logger.js';

const Input = z.object({});  // D-18: no params

const TIMEOUT_MS = 5 * 60 * 1000;  // ~5 min per D-06

const DESCRIPTION = `Wait for the next user request from the browser UI. This tool blocks until:
(a) the user sends a chat message, inline comment, or action request from the browser, or
(b) ~5 minutes elapse with no activity (returns { type: "no_request" }).

On timeout, immediately call await_user_request again to re-enter the listen loop.

Return shape: { type: "chat" | "inline_comment" | "run_self_review" | "regenerate_summary" | "regenerate_walkthrough" | "no_request", payload?: object }`;

export function registerAwaitUserRequest(
  mcp: McpServer,
  manager: SessionManager,
  queueManager: RequestQueueManager,
): void {
  mcp.registerTool(
    'await_user_request',
    { title: 'Await User Request', description: DESCRIPTION, inputSchema: Input.shape },
    async (_args) => {
      const prKey = manager.getActivePrKey();
      if (!prKey) {
        return {
          content: [{ type: 'text' as const, text: 'No active session. Call start_review first.' }],
          isError: true as const,
        };
      }

      try {
        // Fire request.processing to clear any pending indicator
        await manager.applyEvent(prKey, { type: 'request.processing' });

        const queue = queueManager.getQueue(prKey);
        const req = await queue.waitForRequest(TIMEOUT_MS);

        if (!req) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ type: 'no_request' }) }],
          };
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ type: req.type, payload: req.payload ?? null }) }],
        };
      } catch (err) {
        logger.error('await_user_request failed', err);
        return {
          content: [{ type: 'text' as const, text: `await_user_request failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true as const,
        };
      }
    }
  );
}
