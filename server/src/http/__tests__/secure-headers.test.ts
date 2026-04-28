import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { secureHeadersMw } from '../middleware/secure-headers.js';

describe('secureHeadersMw', () => {
  it('adds a Content-Security-Policy header to responses', async () => {
    const app = new Hono();
    app.use('*', secureHeadersMw());
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://localhost/'));
    expect(res.headers.get('content-security-policy')).not.toBeNull();
  });

  it("CSP contains default-src 'self'", async () => {
    const app = new Hono();
    app.use('*', secureHeadersMw());
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://localhost/'));
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
  });

  it("CSP contains script-src 'self' 'nonce-", async () => {
    const app = new Hono();
    app.use('*', secureHeadersMw());
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://localhost/'));
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("script-src 'self' 'nonce-");
  });

  it("CSP contains frame-ancestors 'none'", async () => {
    const app = new Hono();
    app.use('*', secureHeadersMw());
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://localhost/'));
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("CSP contains object-src 'none'", async () => {
    const app = new Hono();
    app.use('*', secureHeadersMw());
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://localhost/'));
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("object-src 'none'");
  });

  it("CSP contains connect-src 'self'", async () => {
    const app = new Hono();
    app.use('*', secureHeadersMw());
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://localhost/'));
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("connect-src 'self'");
  });

  it("CSP contains style-src 'self' 'unsafe-inline' (Tailwind 4 runtime props)", async () => {
    const app = new Hono();
    app.use('*', secureHeadersMw());
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://localhost/'));
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('CSP does NOT contain ws:// (D-01 — WebSocket killed in Phase 1)', async () => {
    const app = new Hono();
    app.use('*', secureHeadersMw());
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://localhost/'));
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).not.toContain('ws://');
  });

  it('CSP img-src allows GitHub avatar domain', async () => {
    const app = new Hono();
    app.use('*', secureHeadersMw());
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://localhost/'));
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain('https://avatars.githubusercontent.com');
  });

  it('c.get("secureHeadersNonce") returns a non-empty string from a handler', async () => {
    const app = new Hono();
    app.use('*', secureHeadersMw());
    let capturedNonce = '';
    app.get('/', (c) => {
      capturedNonce = c.get('secureHeadersNonce') ?? '';
      return c.text('ok');
    });
    await app.fetch(new Request('http://localhost/'));
    expect(capturedNonce).toBeTruthy();
    expect(capturedNonce.length).toBeGreaterThan(0);
  });
});
