import type { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import type { SessionManager } from '../../session/manager.js';
import { renderIndex } from '../render-index.js';

export function mountStatic(app: Hono, _manager: SessionManager) {
  // Serve Vite's built assets — scoped to web/dist only (T-07 path traversal defense)
  app.use('/assets/*', serveStatic({ root: './web/dist' }));

  // GET / — bootstrap HTML with nonce substitution
  app.get('/', (c) => {
    const nonce = c.get('secureHeadersNonce') ?? '';
    return c.html(renderIndex(nonce));
  });
}
