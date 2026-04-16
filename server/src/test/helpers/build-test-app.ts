// Returns a Hono app + a minimal SessionManager stub for middleware tests.
// Real SessionManager lands in Plan 02 — this stub implements the surface used by middleware only.
import { Hono } from 'hono';

export function makeStubManager(opts: { token: string; port: number }) {
  const baseUrl = `http://127.0.0.1:${opts.port}/?token=${opts.token}`;
  return {
    getSessionToken: () => opts.token,
    getHttpPort: () => opts.port,
    getLaunchUrl: () => baseUrl,
    sessionLaunchUrl: (prKey: string) => `${baseUrl}&session=${encodeURIComponent(prKey)}`,
  } as const;
}

export function emptyApp() { return new Hono(); }
