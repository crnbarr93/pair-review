import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { hostValidate } from '../middleware/host-validate.js';
import { makeStubManager } from '../../test/helpers/build-test-app.js';

describe('hostValidate', () => {
  it('rejects Host: evil.com with 400', async () => {
    const manager = makeStubManager({ token: 't', port: 8080 });
    const app = new Hono();
    app.use('*', hostValidate(manager as any));
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://127.0.0.1:8080/', { headers: { Host: 'evil.com' } }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Bad host');
  });

  it('allows Host: 127.0.0.1:8080 on port 8080', async () => {
    const manager = makeStubManager({ token: 't', port: 8080 });
    const app = new Hono();
    app.use('*', hostValidate(manager as any));
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://127.0.0.1:8080/', { headers: { Host: '127.0.0.1:8080' } }));
    expect(res.status).toBe(200);
  });

  it('allows Host: localhost:8080 on port 8080', async () => {
    const manager = makeStubManager({ token: 't', port: 8080 });
    const app = new Hono();
    app.use('*', hostValidate(manager as any));
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://127.0.0.1:8080/', { headers: { Host: 'localhost:8080' } }));
    expect(res.status).toBe(200);
  });

  it('rejects Host: 127.0.0.1:9999 when port is 8080 (port mismatch)', async () => {
    const manager = makeStubManager({ token: 't', port: 8080 });
    const app = new Hono();
    app.use('*', hostValidate(manager as any));
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://127.0.0.1:8080/', { headers: { Host: '127.0.0.1:9999' } }));
    expect(res.status).toBe(400);
  });

  it('rejects empty Host header with 400', async () => {
    const manager = makeStubManager({ token: 't', port: 8080 });
    const app = new Hono();
    app.use('*', hostValidate(manager as any));
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://127.0.0.1:8080/', { headers: { Host: '' } }));
    expect(res.status).toBe(400);
  });

  it('returns 503 when port is not yet set (manager.getHttpPort() returns null)', async () => {
    const manager = {
      getSessionToken: () => 't',
      getHttpPort: () => null,
      getLaunchUrl: () => '',
    };
    const app = new Hono();
    app.use('*', hostValidate(manager as any));
    app.get('/', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://127.0.0.1:8080/', { headers: { Host: '127.0.0.1:8080' } }));
    expect(res.status).toBe(503);
  });

  it('ordering canary: bad Host + no token returns 400 not 403 (Pitfall-6 gate)', async () => {
    const manager = makeStubManager({ token: 't', port: 8080 });
    // Import is deferred so the impl files need not exist yet during RED
    const { buildHttpApp } = await import('../server.js');
    const app = buildHttpApp(manager as any);
    const res = await app.fetch(
      new Request('http://127.0.0.1:8080/api/events', { headers: { Host: 'evil.com' } })
    );
    // HOST rejection (400) must beat token rejection (403) — ordering canary
    expect(res.status).toBe(400);
  });
});
