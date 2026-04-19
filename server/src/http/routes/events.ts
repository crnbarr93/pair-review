import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SessionManager } from '../../session/manager.js';
import type { SnapshotMessage, UpdateMessage } from '@shared/types';
import type { SessionUpdatedPayload } from '../../session/bus.js';

export function mountEvents(app: Hono, manager: SessionManager) {
  app.get('/api/events', (c) => {
    const prKey = c.req.query('session');
    if (!prKey) return c.text('Missing session', 400);
    const session = manager.get(prKey);
    if (!session) return c.text('Unknown session', 404);

    // Standard SSE reconnect semantics. Phase 2 ALWAYS sends a full snapshot on
    // (re)connect regardless of Last-Event-ID — the replay event log is v2.
    // We still READ the header so any future replay implementation has an obvious hook.
    void c.req.header('Last-Event-ID');

    return streamSSE(c, async (stream) => {
      // PITFALL E MITIGATION: subscribe BEFORE sending the snapshot.
      // Any event fired during the "subscribe-to-snapshot" window goes into the buffer
      // and is flushed right after the snapshot.
      const buffer: UpdateMessage[] = [];
      const onUpdate = (payload: SessionUpdatedPayload) => {
        if (payload.id === prKey) {
          buffer.push({ type: 'update', event: payload.event, state: payload.state });
        }
      };
      manager.bus.on('session:updated', onUpdate);
      stream.onAbort(() => {
        manager.bus.off('session:updated', onUpdate);
      });

      // Snapshot — always sent on (re)connect
      const snapshotPayload: SnapshotMessage = {
        type: 'snapshot',
        session,
        launchUrl: manager.sessionLaunchUrl(prKey),
        tokenLast4: manager.getTokenLast4(),
      };
      await stream.writeSSE({
        event: 'snapshot',
        data: JSON.stringify(snapshotPayload),
        id: String(session.lastEventId),
      });

      // Drain buffered updates that landed during the subscribe-to-snapshot window.
      // Skip events whose lastEventId is already reflected in the snapshot.
      while (buffer.length) {
        const u = buffer.shift()!;
        if (u.state.lastEventId > session.lastEventId) {
          await stream.writeSSE({
            event: 'update',
            data: JSON.stringify(u),
            id: String(u.state.lastEventId),
          });
        }
      }

      // Go live: replace the buffer-push listener with a write-push listener.
      manager.bus.off('session:updated', onUpdate);
      const onUpdateLive = async (payload: SessionUpdatedPayload) => {
        if (payload.id !== prKey) return;
        const u: UpdateMessage = { type: 'update', event: payload.event, state: payload.state };
        await stream.writeSSE({
          event: 'update',
          data: JSON.stringify(u),
          id: String(payload.state.lastEventId),
        });
      };
      manager.bus.on('session:updated', onUpdateLive);
      stream.onAbort(() => {
        manager.bus.off('session:updated', onUpdateLive);
      });

      // Keep-alive ping every 15s (preserves Phase 1 behavior)
      while (true) {
        await stream.sleep(15_000);
        await stream.writeSSE({ event: 'ping', data: '' });
      }
    });
  });
}
