import type { MiddlewareHandler } from 'hono';
import type { SessionManager } from '../../session/manager.js';

export function hostValidate(manager: SessionManager): MiddlewareHandler {
  return async (c, next) => {
    const host = (c.req.header('host') ?? '').toLowerCase();
    const port = manager.getHttpPort();
    if (port == null) return c.text('Server not ready', 503);
    const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!allowed.has(host)) return c.text('Bad host', 400);
    return next();
  };
}
