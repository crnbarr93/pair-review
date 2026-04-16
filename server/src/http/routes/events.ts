import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SessionManager } from '../../session/manager.js';
import type { SnapshotMessage } from '@shared/types';

export function mountEvents(app: Hono, manager: SessionManager) {
  app.get('/api/events', (c) => {
    const prKey = c.req.query('session');
    if (!prKey) return c.text('Missing session', 400);
    const session = manager.get(prKey);
    if (!session) return c.text('Unknown session', 404);

    return streamSSE(c, async (stream) => {
      const payload: SnapshotMessage = {
        type: 'snapshot',
        session,
        launchUrl: manager.sessionLaunchUrl(prKey),
        tokenLast4: manager.getTokenLast4(),
      };
      await stream.writeSSE({
        event: 'snapshot',
        data: JSON.stringify(payload),
        id: '0',
      });
      stream.onAbort(() => { /* Plan 2+ releases bus subscriptions here */ });
      // Keep-alive ping every 15s (local — prevents proxies from closing; not strictly needed)
      while (true) {
        await stream.sleep(15_000);
        await stream.writeSSE({ event: 'ping', data: '' });
      }
    });
  });
}
