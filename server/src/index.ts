import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { SessionManager } from './session/manager.js';
import { RequestQueueManager } from './session/request-queue.js';
import { buildHttpApp } from './http/server.js';
import { startMcp } from './mcp/server.js';
import { logger } from './logger.js';
import { pluginRoot } from './plugin-paths.js';

const DEV_MODE = process.argv.includes('--dev') || process.env.REVIEW_DEV === '1';
const VITE_PORT = 5173;

function spawnViteDev(apiPort: number): ChildProcess {
  const webDir = path.join(pluginRoot(), 'web');
  const child = spawn('npx', ['vite', '--port', String(VITE_PORT)], {
    cwd: webDir,
    env: { ...process.env, REVIEW_SERVER_PORT: String(apiPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d: Buffer) => logger.info(`[vite] ${d.toString().trim()}`));
  child.stderr?.on('data', (d: Buffer) => logger.info(`[vite] ${d.toString().trim()}`));
  child.on('exit', (code) => logger.info(`[vite] exited with code ${code}`));
  return child;
}

async function main() {
  const sessionToken = crypto.randomBytes(32).toString('base64url');
  const manager = new SessionManager({ sessionToken });
  const queueManager = new RequestQueueManager();

  const app = buildHttpApp(manager, queueManager);
  let viteChild: ChildProcess | null = null;

  const httpServer = serve(
    { fetch: app.fetch, port: 0, hostname: '127.0.0.1' },
    (info) => {
      manager.setHttpPort(info.port);

      if (DEV_MODE) {
        viteChild = spawnViteDev(info.port);
        const url = `http://127.0.0.1:${VITE_PORT}/?token=${sessionToken}`;
        manager.setLaunchUrl(url);
        logger.info(`[dev] API server on :${info.port}, Vite HMR on :${VITE_PORT}`);
        logger.info(`Review server listening at ${url}`);
      } else {
        const url = `http://127.0.0.1:${info.port}/?token=${sessionToken}`;
        manager.setLaunchUrl(url);
        logger.info(`Review server listening at ${url}`);
      }
    }
  );

  await startMcp(manager, queueManager);
  logger.info('MCP server ready on stdio');

  const shutdown = (signal: string) => {
    logger.info(`${signal} received; shutting down.`);
    if (viteChild) viteChild.kill();
    httpServer.close(() => process.exit(0));
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
