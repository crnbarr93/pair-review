import type { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { SessionManager } from '../../session/manager.js';

const AdoptInput = z.object({ token: z.string().min(1) });

export function mountSessionAdopt(app: Hono, manager: SessionManager) {
  app.post('/api/session/adopt', async (c) => {
    const body = AdoptInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.text('Bad request', 400);
    if (body.data.token !== manager.getSessionToken()) return c.text('Forbidden', 403);
    setCookie(c, 'review_session', manager.getSessionToken(), {
      httpOnly: true,
      sameSite: 'Strict',
      secure: false,          // 127.0.0.1 has no TLS — secure=true would prevent cookie from ever being sent
      path: '/',
    });
    return c.json({ ok: true });
  });
}
