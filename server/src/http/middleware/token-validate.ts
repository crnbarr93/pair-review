import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { SessionManager } from '../../session/manager.js';

export function tokenValidate(manager: SessionManager): MiddlewareHandler {
  return async (c, next) => {
    // Bypass: /api/session/adopt reads its own token from body (bootstrap endpoint)
    if (c.req.path === '/api/session/adopt') return next();

    const cookie = getCookie(c, 'review_session');
    const launchToken = manager.getSessionToken();

    // SSE cookie-only path (D-10): EventSource can't set custom headers
    if (c.req.method === 'GET' && c.req.path === '/api/events') {
      if (cookie !== launchToken) return c.text('Forbidden', 403);
      return next();
    }

    // Double-submit for state-changing requests: header === cookie === launchToken
    const header = c.req.header('x-review-token');
    if (!header || !cookie || header !== cookie || header !== launchToken) {
      return c.text('Forbidden', 403);
    }
    return next();
  };
}
