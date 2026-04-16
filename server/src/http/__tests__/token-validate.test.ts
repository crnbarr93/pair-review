import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { tokenValidate } from '../middleware/token-validate.js';
import { makeStubManager } from '../../test/helpers/build-test-app.js';

describe('tokenValidate', () => {
  it('bypasses /api/session/adopt (bootstrap endpoint)', async () => {
    const manager = makeStubManager({ token: 'secret', port: 8080 });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    app.post('/api/session/adopt', (c) => c.text('ok'));
    const res = await app.fetch(
      new Request('http://localhost/api/session/adopt', { method: 'POST' })
    );
    expect(res.status).toBe(200);
  });

  it('allows GET /api/events with correct cookie', async () => {
    const manager = makeStubManager({ token: 'secret', port: 8080 });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    app.get('/api/events', (c) => c.text('ok'));
    const res = await app.fetch(
      new Request('http://localhost/api/events', {
        headers: { Cookie: 'review_session=secret' },
      })
    );
    expect(res.status).toBe(200);
  });

  it('blocks GET /api/events with no cookie with 403', async () => {
    const manager = makeStubManager({ token: 'secret', port: 8080 });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    app.get('/api/events', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://localhost/api/events'));
    expect(res.status).toBe(403);
  });

  it('blocks GET /api/events with wrong cookie with 403', async () => {
    const manager = makeStubManager({ token: 'secret', port: 8080 });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    app.get('/api/events', (c) => c.text('ok'));
    const res = await app.fetch(
      new Request('http://localhost/api/events', {
        headers: { Cookie: 'review_session=wrongtoken' },
      })
    );
    expect(res.status).toBe(403);
  });

  it('allows POST /api/foo with matching double-submit (header + cookie + launchToken all same)', async () => {
    const manager = makeStubManager({ token: 'secret', port: 8080 });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    app.post('/api/foo', (c) => c.text('ok'));
    const res = await app.fetch(
      new Request('http://localhost/api/foo', {
        method: 'POST',
        headers: {
          Cookie: 'review_session=secret',
          'X-Review-Token': 'secret',
        },
      })
    );
    expect(res.status).toBe(200);
  });

  it('blocks POST /api/foo with header != cookie with 403', async () => {
    const manager = makeStubManager({ token: 'secret', port: 8080 });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    app.post('/api/foo', (c) => c.text('ok'));
    const res = await app.fetch(
      new Request('http://localhost/api/foo', {
        method: 'POST',
        headers: {
          Cookie: 'review_session=secret',
          'X-Review-Token': 'different',
        },
      })
    );
    expect(res.status).toBe(403);
  });

  it('blocks POST /api/foo with no X-Review-Token header with 403', async () => {
    const manager = makeStubManager({ token: 'secret', port: 8080 });
    const app = new Hono();
    app.use('/api/*', tokenValidate(manager as any));
    app.post('/api/foo', (c) => c.text('ok'));
    const res = await app.fetch(
      new Request('http://localhost/api/foo', {
        method: 'POST',
        headers: { Cookie: 'review_session=secret' },
      })
    );
    expect(res.status).toBe(403);
  });
});
