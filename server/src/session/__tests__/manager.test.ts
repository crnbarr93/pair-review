import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock launchBrowser to avoid actual browser opening
vi.mock('../../browser-launch.js', () => ({
  launchBrowser: vi.fn(async () => undefined),
}));

// Mock writeState to avoid filesystem I/O during unit tests
vi.mock('../../persist/store.js', () => ({
  writeState: vi.fn(async () => undefined),
  readState: vi.fn(async () => null),
}));

// Mock ingest adapters so unit tests don't run git/gh CLIs
vi.mock('../../ingest/github.js', () => ({
  ingestGithub: vi.fn(async () => ({
    meta: {
      title: 'Test PR',
      body: 'desc',
      author: { login: 'testuser' },
      baseRefName: 'main',
      headRefName: 'feat/x',
      baseRefOid: 'abc000',
      headRefOid: 'def111',
      additions: 10,
      deletions: 2,
      changedFiles: 1,
    },
    diffText:
      'diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-const x = 1;\n+const x = 2;\n',
  })),
}));

vi.mock('../../ingest/local.js', () => ({
  ingestLocal: vi.fn(async () => ({
    diffText:
      'diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-const x = 1;\n+const x = 2;\n',
    baseSha: 'baseshahex',
    headSha: 'headshahex',
  })),
}));

vi.mock('../../ingest/repo-infer.js', () => ({
  inferRepoFromCwd: vi.fn(async () => ({ owner: 'test-owner', name: 'test-repo' })),
}));

// Mock Shiki — fast, no real highlighting in unit tests
vi.mock('../../highlight/shiki.js', () => ({
  highlightHunks: vi.fn(async () => []),
}));

describe('SessionManager', () => {
  let SessionManager: typeof import('../manager.js').SessionManager;
  let launchBrowserMock: ReturnType<typeof vi.fn>;
  let writeStateMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const managerMod = await import('../manager.js');
    SessionManager = managerMod.SessionManager;

    const launchMod = await import('../../browser-launch.js');
    launchBrowserMock = vi.mocked(launchMod.launchBrowser);

    const storeMod = await import('../../persist/store.js');
    writeStateMock = vi.mocked(storeMod.writeState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getTokenLast4 returns the last 4 characters of the sessionToken', () => {
    const manager = new SessionManager({ sessionToken: 'abc123def456' });
    expect(manager.getTokenLast4()).toBe('f456');
  });

  it('startReview with local source returns a ReviewSession with correct prKey shape', async () => {
    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=testtoken1234');

    const session = await manager.startReview({ kind: 'local', base: 'main', head: 'HEAD' });

    expect(session.prKey).toMatch(/^local:[0-9a-f]{64}$/);
    expect(session.pr.source).toBe('local');
    // Real diff is produced from the mocked diffText
    expect(session.diff).toBeDefined();
    expect(session.diff.files).toBeInstanceOf(Array);
  });

  it('startReview is idempotent — returns same session instance on second call', async () => {
    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=testtoken1234');

    const source = { kind: 'local' as const, base: 'main', head: 'feat/foo' };
    const session1 = await manager.startReview(source);
    const session2 = await manager.startReview(source);

    expect(session1).toBe(session2);
  });

  it('launchBrowser is called exactly ONCE even after two startReview calls with same source', async () => {
    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=testtoken1234');

    const source = { kind: 'local' as const, base: 'main', head: 'feat/bar' };
    await manager.startReview(source);
    await manager.startReview(source);

    expect(launchBrowserMock).toHaveBeenCalledTimes(1);
  });

  it('writeState is called exactly once per new session', async () => {
    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=testtoken1234');

    const source = { kind: 'local' as const, base: 'main', head: 'feat/baz' };
    await manager.startReview(source);
    await manager.startReview(source); // second call should not write again

    expect(writeStateMock).toHaveBeenCalledTimes(1);
  });

  it('get() returns undefined for unknown prKey', () => {
    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    expect(manager.get('gh:unknown/repo#999')).toBeUndefined();
  });

  it('get() returns the session after startReview', async () => {
    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=testtoken1234');

    const source = { kind: 'local' as const, base: 'main', head: 'feat/get' };
    const session = await manager.startReview(source);

    expect(manager.get(session.prKey)).toBe(session);
  });

  it('startReview with github URL source returns session with correct prKey', async () => {
    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=testtoken1234');

    const session = await manager.startReview({
      kind: 'github',
      url: 'https://github.com/octocat/hello/pull/42',
    });

    expect(session.prKey).toBe('gh:octocat/hello#42');
  });

  it('startReview wires toDiffModel — diff.files comes from parsed diffText', async () => {
    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=testtoken1234');

    const session = await manager.startReview({ kind: 'local', base: 'main', head: 'HEAD' });

    // The mock ingestLocal returns a diff with one file; toDiffModel should parse it
    expect(session.diff.files.length).toBeGreaterThanOrEqual(1);
  });

  it('startReview sets lastEventId=0 on the newly-created session', async () => {
    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=testtoken1234');
    const session = await manager.startReview({ kind: 'local', base: 'main', head: 'HEAD' });
    expect(session.lastEventId).toBe(0);
  });
});

describe('SessionManager.applyEvent', () => {
  let SessionManager: typeof import('../manager.js').SessionManager;
  let writeStateMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const managerMod = await import('../manager.js');
    SessionManager = managerMod.SessionManager;
    const storeMod = await import('../../persist/store.js');
    writeStateMock = vi.mocked(storeMod.writeState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function seedSession() {
    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=testtoken1234');
    const source = { kind: 'local' as const, base: 'main', head: 'feat/seed' };
    const session = await manager.startReview(source);
    return { manager, session };
  }

  it('applyEvent-1: persist-then-broadcast ordering (writeState resolves before bus emit)', async () => {
    const { manager, session } = await seedSession();
    const order: string[] = [];

    writeStateMock.mockImplementation(async () => {
      order.push('writeState');
    });
    manager.bus.on('session:updated', () => {
      order.push('bus');
    });

    await manager.applyEvent(session.prKey, { type: 'session.viewBoth' });
    expect(order).toEqual(['writeState', 'bus']);
  });

  it('applyEvent-2: increments lastEventId monotonically', async () => {
    const { manager, session } = await seedSession();
    expect(session.lastEventId).toBe(0);

    const after1 = await manager.applyEvent(session.prKey, { type: 'session.viewBoth' });
    expect(after1.lastEventId).toBe(1);

    const after2 = await manager.applyEvent(session.prKey, { type: 'session.viewBoth' });
    expect(after2.lastEventId).toBe(2);
  });

  it('applyEvent-3: persisted JSON includes the incremented lastEventId', async () => {
    const { manager, session } = await seedSession();
    await manager.applyEvent(session.prKey, { type: 'session.viewBoth' });
    const lastCall = writeStateMock.mock.calls[writeStateMock.mock.calls.length - 1];
    const persistedBlob = lastCall[1] as { lastEventId: number };
    expect(persistedBlob.lastEventId).toBe(1);
  });

  it('applyEvent-4: concurrent calls on same prKey serialize via queue', async () => {
    const { manager, session } = await seedSession();
    const seen: number[] = [];
    manager.bus.on('session:updated', (payload) => {
      seen.push(payload.state.lastEventId);
    });

    await Promise.all([
      manager.applyEvent(session.prKey, { type: 'session.viewBoth' }),
      manager.applyEvent(session.prKey, { type: 'session.viewBoth' }),
    ]);

    const final = manager.get(session.prKey)!;
    expect(final.lastEventId).toBe(2);
    expect(seen).toEqual([1, 2]);
  });

  it('applyEvent-5: rejects with "No session for prKey" on unknown prKey', async () => {
    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    await expect(
      manager.applyEvent('gh:unknown/repo#999', { type: 'session.viewBoth' })
    ).rejects.toThrow(/No session for prKey/);
  });
});
