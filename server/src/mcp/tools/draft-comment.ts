import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';

const Input = z.object({
  prKey: z.string().min(1).max(200),
  threadId: z.string().min(1).max(40),
  body: z.string().min(1).max(65536),
});

// D-09 / D-20: the description IS the prompt for this tool. The Claude Code session reads
// this string via tools/list at connection time. No runtime templating, no separate prompt file.
export const DESCRIPTION: string = [
  'Synthesize a conversational thread into a single review comment draft.',
  '',
  'Call this AFTER the thread conversation has reached a conclusion.',
  'The body should be a clean, standalone review comment that distills the',
  'discussion — NOT a concatenation of all messages.',
  '',
  'The synthesized text appears in an editable textarea in the review UI.',
  'The user can revise it before the review is submitted in Phase 6.',
  '',
  'threadId must be a value returned from a prior reply_in_thread call.',
].join('\n');

export function registerDraftComment(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'draft_comment',
    { title: 'Draft Comment', description: DESCRIPTION, inputSchema: Input.shape },
    async ({ prKey, threadId, body }) => {
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
          type: 'thread.draftSet',
          threadId: threadId as string,
          body: body as string,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: `Draft comment set for thread ${threadId}. User can edit before submission.`,
            },
          ],
        };
      } catch (err) {
        logger.error('draft_comment failed', err);
        return {
          content: [
            {
              type: 'text' as const,
              text: `draft_comment failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true as const,
        };
      }
    }
  );
}
