import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';

const Input = z.object({
  prKey: z.string().min(1).max(200),
  threadId: z.string().min(1).max(40),
});

// D-09 / D-20: the description IS the prompt for this tool. The Claude Code session reads
// this string via tools/list at connection time. No runtime templating, no separate prompt file.
export const DESCRIPTION: string = [
  'Mark a conversational thread as resolved without drafting a comment to post.',
  '',
  'Use this when the thread discussion concluded but no review comment is needed',
  '(e.g., a question was answered, a false alarm was cleared).',
  '',
  'threadId must be a value returned from a prior reply_in_thread call.',
].join('\n');

export function registerResolveThread(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'resolve_thread',
    { title: 'Resolve Thread', description: DESCRIPTION, inputSchema: Input.shape },
    async ({ prKey, threadId }) => {
      try {
        const session = manager.get(prKey);
        if (!session) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `session not found for prKey "${prKey}". Call start_review first.`,
              },
            ],
            isError: true as const,
          };
        }
        if (!session.threads?.[threadId as string]) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `threadId "${threadId}" not found. Use reply_in_thread to create a thread first.`,
              },
            ],
            isError: true as const,
          };
        }
        await manager.applyEvent(prKey, {
          type: 'thread.resolved',
          threadId: threadId as string,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: `Thread ${threadId} resolved.`,
            },
          ],
        };
      } catch (err) {
        logger.error('resolve_thread failed', err);
        return {
          content: [
            {
              type: 'text' as const,
              text: `resolve_thread failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true as const,
        };
      }
    }
  );
}
