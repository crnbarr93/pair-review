import { Hono } from 'hono';
import type { SessionManager } from '../session/manager.js';
import { hostValidate } from './middleware/host-validate.js';
import { tokenValidate } from './middleware/token-validate.js';
import { secureHeadersMw } from './middleware/secure-headers.js';
import { mountSessionAdopt } from './routes/session-adopt.js';
import { mountEvents } from './routes/events.js';
import { mountStatic } from './routes/static.js';

export function buildHttpApp(manager: SessionManager): Hono {
  const app = new Hono();
  // 1. Host allowlist FIRST — defeats DNS rebinding before any routing (T-01-01)
  app.use('*', hostValidate(manager));
  // 2. CSP + NONCE before any HTML render (SEC-04 / T-01-04)
  app.use('*', secureHeadersMw());
  // 3. Token validation SCOPED to /api/* — GET / needs no cookie (bootstrap HTML)
  app.use('/api/*', tokenValidate(manager));
  // 4. Routes
  mountSessionAdopt(app, manager);
  mountEvents(app, manager);
  mountStatic(app, manager);
  return app;
}
