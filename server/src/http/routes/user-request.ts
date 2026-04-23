import type { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { SessionManager } from '../../session/manager.js';
import type { RequestQueueManager } from '../../session/request-queue.js';
import { resolveLineIdExtended } from '../../mcp/tools/resolve-ids.js';

const bodySchema = z
  .object({
    prKey: z.string().min(1),
    type: z.enum([
      'chat',
      'inline_comment',
      'run_self_review',
      'regenerate_summary',
      'regenerate_walkthrough',
    ]),
    payload: z.record(z.unknown()).optional(),
  })
  .strict();

export function mountUserRequest(
  app: Hono,
  manager: SessionManager,
  queueManager: RequestQueueManager,
): void {
  app.post('/api/user-request', async (c) => {
    const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.text('Bad request', 400);

    const { prKey, type, payload } = parsed.data;
    const session = manager.get(prKey);
    if (!session) return c.text('Unknown session', 404);

    // chat type: fire chat.userMessage immediately for instant UI feedback
    if (type === 'chat' && payload?.message) {
      await manager.applyEvent(prKey, {
        type: 'chat.userMessage',
        message: payload.message as string,
        timestamp: new Date().toISOString(),
      });
    }

    // inline_comment type: resolve lineId server-side, fire thread.userStarted, conditionally enqueue
    if (type === 'inline_comment') {
      const lineId = payload?.lineId as string | undefined;
      const message = payload?.message as string | undefined;
      if (!lineId || !message) return c.text('lineId and message required', 400);

      const resolved = resolveLineIdExtended(session.diff, lineId);
      if (!resolved) return c.text('Invalid lineId', 400);

      const isClaudeTagged = payload?.isClaudeTagged === true;
      const threadId = `th_${nanoid(10)}`;

      await manager.applyEvent(prKey, {
        type: 'thread.userStarted',
        lineId,
        path: resolved.path,
        line: resolved.line,
        side: resolved.side,
        threadId,
        message,
        isClaudeTagged,
        timestamp: new Date().toISOString(),
      });

      if (isClaudeTagged) {
        // @claude tagged — forward to LLM via the queue
        queueManager.getQueue(prKey).enqueue({
          type: 'inline_comment',
          payload: { lineId, message, threadId, isClaudeTagged },
        });
      }
      // Non-@claude: thread created above is sufficient — no queue needed
      return c.json({ ok: true, queued: false });
    }

    // For all other types: enqueue for await_user_request pickup
    const queue = queueManager.getQueue(prKey);
    const pending = queue.pendingCount;

    // If items already queued (Claude is busy), fire request.queued SSE
    if (pending > 0) {
      await manager.applyEvent(prKey, {
        type: 'request.queued',
        requestType: type,
        position: pending,
      });
    }

    queue.enqueue({ type, payload });
    return c.json({ ok: true, queued: queue.pendingCount > 1 });
  });
}
