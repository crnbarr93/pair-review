import crypto from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { SessionManager } from './session/manager.js';
import { startMcp } from './mcp/server.js';
import { logger } from './logger.js';

async function main() {
  const sessionToken = crypto.randomBytes(32).toString('base64url');
  const manager = new SessionManager({ sessionToken });

  // PHASE-1 STUB HTTP APP — Plan 03 replaces with buildHttpApp(manager)
  const app = new Hono();
  app.get('/', (c) => c.text('Stub — Plan 03 mounts real routes', 200));

  const httpServer = serve(
    { fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, // SEC-01: 127.0.0.1 ONLY
    (info) => {
      manager.setHttpPort(info.port);
      const url = `http://127.0.0.1:${info.port}/?token=${sessionToken}`;
      manager.setLaunchUrl(url);
      // D-13 / PLUG-03: stderr echo — NEVER stdout (AP2)
      logger.info(`Review server listening at ${url}`);
    }
  );

  await startMcp(manager);
  logger.info('MCP server ready on stdio');

  const shutdown = (signal: string) => {
    logger.info(`${signal} received; shutting down.`);
    httpServer.close(() => process.exit(0));
    // Hard-exit backstop after 2s in case close() hangs on an active SSE
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  // stderr only — NEVER console.log (AP2)
  logger.error('Fatal:', err);
  process.exit(1);
});
