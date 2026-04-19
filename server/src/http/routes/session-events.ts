// Phase 3 — POST /api/session/events
//
// Accepts user-triggered SessionEvents from the web client (keyboard r-key /
// "Mark reviewed" button / generated-file expand-or-collapse). Server-only
// SessionEvent variants are explicitly excluded from the accepted union —
// posting one of those types returns 400 (T-3-06 mitigation).
//
// Security boundaries (all Phase-1 middleware still applies):
//   - hostValidate runs first (DNS rebinding defense)
//   - secureHeadersMw emits CSP
//   - tokenValidate runs on /api/* (double-submit X-Review-Token → 403 if missing)
// This handler adds the payload-shape gate (zod-validated → 400 on any type
// the client should not be emitting).

import type { Hono } from 'hono';
import { z } from 'zod';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';

const reviewStatusSchema = z
  .object({
    type: z.literal('file.reviewStatusSet'),
    fileId: z.string().min(1),
    status: z.enum(['untouched', 'in-progress', 'reviewed']),
  })
  .strict();

const expandToggleSchema = z
  .object({
    type: z.literal('file.generatedExpandToggled'),
    fileId: z.string().min(1),
    expanded: z.boolean(),
  })
  .strict();

// Only USER-TRIGGERED variants are accepted. Server-generated variants and
// resume-choice variants are deliberately omitted — a client posting one of
// those types fails zod validation (400).
const userEventSchema = z.discriminatedUnion('type', [reviewStatusSchema, expandToggleSchema]);

const bodySchema = z
  .object({
    prKey: z.string().min(1),
    event: userEventSchema,
  })
  .strict();

export function mountSessionEvents(app: Hono, manager: SessionManager): void {
  app.post('/api/session/events', async (c) => {
    const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.text('Bad request', 400);

    const { prKey, event } = parsed.data;
    const session = manager.get(prKey);
    if (!session) return c.text('Unknown session', 404);

    try {
      await manager.applyEvent(prKey, event);
    } catch (err) {
      logger.warn('applyEvent failed in /api/session/events', err);
      return c.text('Internal error', 500);
    }
    return c.json({ ok: true });
  });
}
