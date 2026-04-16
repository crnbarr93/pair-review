import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { mountSessionAdopt } from '../routes/session-adopt.js';
import { makeStubManager } from '../../test/helpers/build-test-app.js';

function buildApp(token: string) {
  const manager = makeStubManager({ token, port: 8080 });
  const app = new Hono();
  mountSessionAdopt(app, manager as any);
  return app;
}

describe('mountSessionAdopt', () => {
  it('returns 200 + {ok:true} when token is correct', async () => {
    const app = buildApp('correct-token');
    const res = await app.fetch(
      new Request('http://localhost/api/session/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'correct-token' }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it('sets Set-Cookie with HttpOnly; SameSite=Strict; Path=/ on success', async () => {
    const app = buildApp('mytoken');
    const res = await app.fetch(
      new Request('http://localhost/api/session/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'mytoken' }),
      })
    );
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
  });

  it('does NOT set Secure flag on cookie (localhost has no TLS)', async () => {
    const app = buildApp('mytoken');
    const res = await app.fetch(
      new Request('http://localhost/api/session/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'mytoken' }),
      })
    );
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    // Cookie must NOT have Secure attribute — localhost TLS is absent
    // The attribute is either absent or explicitly set to false (not in the string)
    expect(cookie.toLowerCase()).not.toMatch(/;\s*secure(?:\s*;|$)/);
  });

  it('returns 403 when token is wrong', async () => {
    const app = buildApp('real-token');
    const res = await app.fetch(
      new Request('http://localhost/api/session/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'wrong-token' }),
      })
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when body is missing token field', async () => {
    const app = buildApp('real-token');
    const res = await app.fetch(
      new Request('http://localhost/api/session/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notAToken: 'foo' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is malformed JSON', async () => {
    const app = buildApp('real-token');
    const res = await app.fetch(
      new Request('http://localhost/api/session/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json{{{',
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is empty', async () => {
    const app = buildApp('real-token');
    const res = await app.fetch(
      new Request('http://localhost/api/session/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(res.status).toBe(400);
  });
});
