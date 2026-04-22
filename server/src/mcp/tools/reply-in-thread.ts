import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';
import { resolveLineIdExtended } from './resolve-ids.js';
import type { Thread, ThreadTurn } from '@shared/types';

const Input = z.object({
  prKey: z.string().min(1).max(200),
  lineId: z.string().regex(/^[A-Za-z0-9_-]+:h\d+:l\d+$/, {
    error: 'Invalid lineId. Supply from list_files/get_hunk. Format: `<fileId>:h<hunkIdx>:l<lineIdx>`.',
  }).optional(),
  threadId: z.string().min(1).max(40).optional(),
  message: z.string().min(1).max(4000),
  preExisting: z.boolean().optional(),
}).refine(
  (d) => d.lineId !== undefined || d.threadId !== undefined,
  { error: 'Either lineId (new thread) or threadId (reply to existing) must be supplied.' }
);

export const DESCRIPTION: string = [
  'Start or continue a conversational thread on a diff line.',
  '',
  'New thread: supply `lineId` (opaque, from list_files/get_hunk) + `message`.',
  'Reply to existing thread: supply `threadId` (returned from a prior reply_in_thread call) + `message`.',
  '',
  'Pre-existing code gate: if lineId resolves to an unchanged context line, you MUST set',
  '`preExisting: true` to intentionally flag pre-existing code. Without this flag, context-line',
  'anchors are rejected. Only set preExisting when you are intentionally flagging a pre-existing',
  'issue the PR author should be aware of.',
  '',
  'Anchor discipline: never construct lineId strings from file paths or line numbers.',
  'Use only opaque IDs from list_files / get_hunk.',
].join('\n');

export function registerReplyInThread(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'reply_in_thread',
    { title: 'Reply in Thread', description: DESCRIPTION, inputSchema: Input.shape },
    async ({ prKey, lineId, threadId, message, preExisting }) => {
      try {
        const session = manager.get(prKey);
        if (!session) {
          return {
            content: [{ type: 'text' as const, text: `session not found for prKey "${prKey}". Call start_review first.` }],
            isError: true as const,
          };
        }

        // Runtime guard (MCP SDK may strip .refine())
        if (lineId === undefined && threadId === undefined) {
          return {
            content: [{ type: 'text' as const, text: 'Either lineId (new thread) or threadId (reply to existing) must be supplied.' }],
            isError: true as const,
          };
        }

        const now = new Date().toISOString();
        const turn: ThreadTurn = { author: 'llm', message: message as string, createdAt: now };

        if (threadId !== undefined) {
          // Reply to existing thread
          const existing = session.threads?.[threadId as string];
          if (!existing) {
            return {
              content: [{ type: 'text' as const, text: `threadId "${threadId}" not found. Start a new thread with lineId instead.` }],
              isError: true as const,
            };
          }
          const updatedThread: Thread = {
            ...existing,
            turns: [...existing.turns, turn],
          };
          await manager.applyEvent(prKey, { type: 'thread.replyAdded', threadId: threadId as string, thread: updatedThread });
          return {
            content: [{ type: 'text' as const, text: `Reply added to thread ${threadId}. ${updatedThread.turns.length} turn(s) total.` }],
          };
        }

        // New thread — validate lineId
        const resolved = resolveLineIdExtended(session.diff, lineId as string);
        if (!resolved) {
          return {
            content: [{ type: 'text' as const, text: `lineId "${lineId}" does not resolve to a line in the session diff.` }],
            isError: true as const,
          };
        }

        // preExisting gate (D-11, Pitfall 12 mitigation)
        if (resolved.lineKind === 'context' && !preExisting) {
          return {
            content: [{
              type: 'text' as const,
              text: `lineId "${lineId}" is an unchanged context line. Set preExisting: true to intentionally flag pre-existing code.`,
            }],
            isError: true as const,
          };
        }

        const newThreadId = `th_${nanoid(10)}`;
        const thread: Thread = {
          threadId: newThreadId,
          lineId: lineId as string,
          path: resolved.path,
          line: resolved.line,
          side: resolved.side,
          preExisting: preExisting === true,
          turns: [turn],
          resolved: false,
          createdAt: now,
        };

        await manager.applyEvent(prKey, { type: 'thread.replyAdded', threadId: newThreadId, thread });
        return {
          content: [{ type: 'text' as const, text: `Thread ${newThreadId} created on ${resolved.path}:${resolved.line} (${resolved.side}).` }],
        };
      } catch (err) {
        logger.error('reply_in_thread failed', err);
        return {
          content: [{ type: 'text' as const, text: `reply_in_thread failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true as const,
        };
      }
    }
  );
}
