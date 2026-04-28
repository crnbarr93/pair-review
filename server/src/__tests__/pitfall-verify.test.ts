/**
 * Pitfall verification tests (D-06) — automated evidence for Pitfalls 8, 9, 16.
 *
 * Pitfall 8:  Resume across browser close — state round-trips correctly through disk.
 * Pitfall 9:  Stale-diff detection on resume after force-push — SHA mismatch detected.
 * Pitfall 16: Port-in-use — OS ephemeral port (port: 0) avoids collisions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Pitfall 8 — Resume across browser close (D-06)
// Uses a real tmpDir + real writeState/readState (no file-level mock on store).
// ---------------------------------------------------------------------------

describe('Pitfall 8 — resume across browser close: full round-trip', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pitfall8-'));
    vi.stubEnv('CLAUDE_PLUGIN_DATA', tmpDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('write state, re-read from disk restores all fields', async () => {
    // vi.importActual bypasses the file-level mock and loads the real implementation
    const { writeState, readState } = await vi.importActual<typeof import('../persist/store.js')>('../persist/store.js');

    const data = {
      prKey: 'gh:test/repo#1',
      lastEventId: 5,
      pr: { title: 'test' },
      createdAt: '2026-01-01T00:00:00Z',
      headSha: 'abc123',
    };

    await writeState('gh:test/repo#1', data);
    const reloaded = await readState('gh:test/repo#1');

    expect(reloaded).not.toBeNull();
    expect((reloaded as typeof data).lastEventId).toBe(5);
    expect((reloaded as typeof data).headSha).toBe('abc123');
    expect((reloaded as typeof data).prKey).toBe('gh:test/repo#1');
  });
});

// ---------------------------------------------------------------------------
// Pitfall 9 — Stale-diff detection on resume after force-push (D-06)
// Uses file-level vi.mock() to control readState and fetchCurrentHeadSha.
// ---------------------------------------------------------------------------

vi.mock('../browser-launch.js', () => ({
  launchBrowser: vi.fn(async () => undefined),
}));

vi.mock('../persist/store.js', () => ({
  writeState: vi.fn(async () => undefined),
  readState: vi.fn(async () => null),
}));

vi.mock('../ingest/github.js', () => ({
  ingestGithub: vi.fn(async () => ({
    meta: {
      title: 'Test PR',
      body: 'desc',
      author: { login: 'testuser' },
      baseRefName: 'main',
      headRefName: 'feat/x',
      baseRefOid: 'base000',
      headRefOid: 'new-sha-bbb',
      additions: 0,
      deletions: 0,
      changedFiles: 0,
    },
    diffText: '',
  })),
  fetchCurrentHeadSha: vi.fn(async () => 'new-sha-bbb'),
  fetchExistingComments: vi.fn(async () => []),
  fetchCIChecks: vi.fn(async () => ({ aggregate: 'none', checks: [] })),
}));

vi.mock('../ingest/local.js', () => ({
  ingestLocal: vi.fn(async () => ({
    diffText: '',
    baseSha: 'baseshahex',
    headSha: 'headshahex',
  })),
  fetchCurrentHeadSha: vi.fn(async () => 'headshahex'),
}));

vi.mock('../ingest/parse.js', () => ({
  toDiffModel: vi.fn(() => ({ files: [], totalHunks: 0 })),
}));

vi.mock('../ingest/repo-infer.js', () => ({
  inferRepoFromCwd: vi.fn(async () => ({ owner: 'owner', name: 'repo' })),
}));

vi.mock('../highlight/shiki.js', () => ({
  highlightHunks: vi.fn(async () => []),
}));

vi.mock('../ingest/identity.js', () => ({
  fetchAuthIdentity: vi.fn(async () => null),
}));

vi.mock('open', () => ({ default: vi.fn() }));

// Derived prKey: gh:owner/repo#42 (using inferRepoFromCwd mock returning owner/repo)
const PITFALL9_PR_KEY = 'gh:owner/repo#42';

function makePersistedSession(headSha: string) {
  return {
    prKey: PITFALL9_PR_KEY,
    pr: {
      source: 'github' as const,
      title: 'Test PR',
      description: 'desc',
      author: 'testuser',
      baseBranch: 'main',
      headBranch: 'feat/x',
      baseSha: 'base000',
      headSha,
      additions: 0,
      deletions: 0,
      filesChanged: 0,
      owner: 'owner',
      repo: 'repo',
      number: 42,
    },
    diff: { files: [], totalHunks: 0 },
    shikiTokens: {},
    createdAt: '2026-01-01T00:00:00Z',
    headSha,
    error: null,
    lastEventId: 3,
  };
}

describe('Pitfall 9 — stale-diff detection on resume after force-push', () => {
  let SessionManager: typeof import('../session/manager.js').SessionManager;
  let readStateMock: ReturnType<typeof vi.fn>;
  let fetchGithubHeadShaMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const managerMod = await import('../session/manager.js');
    SessionManager = managerMod.SessionManager;
    const storeMod = await import('../persist/store.js');
    readStateMock = vi.mocked(storeMod.readState);
    const ghMod = await import('../ingest/github.js');
    fetchGithubHeadShaMock = vi.mocked(ghMod.fetchCurrentHeadSha);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('startReview sets staleDiff when stored SHA differs from fetched SHA', async () => {
    readStateMock.mockResolvedValueOnce(makePersistedSession('old-sha-aaa'));
    fetchGithubHeadShaMock.mockResolvedValueOnce('new-sha-bbb');

    const manager = new SessionManager({ sessionToken: 'tt1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=tt1234');

    const session = await manager.startReview({ kind: 'github', number: 42 });

    expect(session.staleDiff).toBeDefined();
    expect(session.staleDiff!.storedSha).toBe('old-sha-aaa');
    expect(session.staleDiff!.currentSha).toBe('new-sha-bbb');
  });

  it('startReview returns no staleDiff when SHA matches', async () => {
    readStateMock.mockResolvedValueOnce(makePersistedSession('old-sha-aaa'));
    fetchGithubHeadShaMock.mockResolvedValueOnce('old-sha-aaa');

    const manager = new SessionManager({ sessionToken: 'tt1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=tt1234');

    const session = await manager.startReview({ kind: 'github', number: 42 });

    expect(session.staleDiff).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Pitfall 16 — Port-in-use fallback via OS ephemeral port (D-06)
// ---------------------------------------------------------------------------

describe('Pitfall 16 — port-in-use: two port:0 servers get distinct non-zero ports', () => {
  it('two serve({ port: 0 }) calls get distinct non-zero ports', async () => {
    const { serve } = await import('@hono/node-server');
    const { Hono } = await import('hono');

    const app1 = new Hono();
    app1.get('/', (c) => c.text('server1'));

    const app2 = new Hono();
    app2.get('/', (c) => c.text('server2'));

    let server1: { close: (cb: () => void) => void };
    let server2: { close: (cb: () => void) => void };

    const port1 = await new Promise<number>((resolve) => {
      server1 = serve({ fetch: app1.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
        resolve(info.port);
      }) as typeof server1;
    });

    const port2 = await new Promise<number>((resolve) => {
      server2 = serve({ fetch: app2.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
        resolve(info.port);
      }) as typeof server2;
    });

    try {
      expect(port1).toBeGreaterThan(0);
      expect(port2).toBeGreaterThan(0);
      expect(port1).not.toBe(port2);
    } finally {
      await new Promise<void>((resolve) => server1.close(() => resolve()));
      await new Promise<void>((resolve) => server2.close(() => resolve()));
    }
  });
});
