import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock launchBrowser to avoid actual browser opening
vi.mock('../../browser-launch.js', () => ({
  launchBrowser: vi.fn(async () => undefined),
}));

// Mock persist layer to avoid disk I/O
vi.mock('../../persist/store.js', () => ({
  writeState: vi.fn(async () => undefined),
  readState: vi.fn(async () => null),
}));

// Mock the ingest pipeline pieces so startReview runs without real gh/git CLIs.
// NOTE: we provide fetchExistingComments + fetchCIChecks mocks here; the Phase 3
// extension in manager.ts must import these from '../../ingest/github.js'.
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
  fetchCurrentHeadSha: vi.fn(async () => 'def111'),
  fetchExistingComments: vi.fn(),
  fetchCIChecks: vi.fn(),
}));

vi.mock('../../ingest/local.js', () => ({
  ingestLocal: vi.fn(async () => ({
    diffText:
      'diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-const x = 1;\n+const x = 2;\n',
    baseSha: 'baseshahex',
    headSha: 'headshahex',
  })),
  fetchCurrentHeadSha: vi.fn(async () => 'headshahex'),
}));

vi.mock('../../ingest/repo-infer.js', () => ({
  inferRepoFromCwd: vi.fn(async () => ({ owner: 'test-owner', name: 'test-repo' })),
}));

// Mock Shiki — fast, no real highlighting in unit tests
vi.mock('../../highlight/shiki.js', () => ({
  highlightHunks: vi.fn(async () => []),
}));

describe('SessionManager.startReview — Phase 3 ingest extensions', () => {
  let SessionManager: typeof import('../manager.js').SessionManager;
  let fetchExistingCommentsMock: ReturnType<typeof vi.fn>;
  let fetchCIChecksMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const managerMod = await import('../manager.js');
    SessionManager = managerMod.SessionManager;
    const githubMod = await import('../../ingest/github.js');
    fetchExistingCommentsMock = vi.mocked(githubMod.fetchExistingComments);
    fetchCIChecksMock = vi.mocked(githubMod.fetchCIChecks);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires existingComments.loaded + ciChecks.loaded events for github source', async () => {
    fetchExistingCommentsMock.mockResolvedValue([
      {
        id: 1,
        lineId: null,
        path: 'foo.ts',
        line: null,
        side: 'BOTH',
        author: 'a',
        createdAt: '2026-04-19T00:00:00Z',
        body: 'nice',
        htmlUrl: 'https://example.test',
      },
    ]);
    fetchCIChecksMock.mockResolvedValue({ aggregate: 'pass', checks: [] });

    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=testtoken1234');

    const applyEventSpy = vi.spyOn(manager, 'applyEvent');
    await manager.startReview({ kind: 'github', url: 'https://github.com/octocat/hello/pull/42' });

    // Both Phase 3 adapter calls ran
    expect(fetchExistingCommentsMock).toHaveBeenCalledTimes(1);
    expect(fetchCIChecksMock).toHaveBeenCalledTimes(1);

    // Both events reached applyEvent
    const eventTypes = applyEventSpy.mock.calls.map((c) => (c[1] as { type: string }).type);
    expect(eventTypes).toContain('existingComments.loaded');
    expect(eventTypes).toContain('ciChecks.loaded');
  });

  it('does NOT fire existingComments.loaded or ciChecks.loaded for local source (D-23, D-26)', async () => {
    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=testtoken1234');

    const applyEventSpy = vi.spyOn(manager, 'applyEvent');
    await manager.startReview({ kind: 'local', base: 'main', head: 'feat/foo' });

    expect(fetchExistingCommentsMock).not.toHaveBeenCalled();
    expect(fetchCIChecksMock).not.toHaveBeenCalled();

    const phase3Calls = applyEventSpy.mock.calls.filter(([, ev]) =>
      ['existingComments.loaded', 'ciChecks.loaded'].includes((ev as { type: string }).type)
    );
    expect(phase3Calls).toHaveLength(0);
  });

  it('logger.warns but does not throw when fetchExistingComments rejects (T-3-12)', async () => {
    fetchExistingCommentsMock.mockRejectedValue(new Error('gh api failed'));
    fetchCIChecksMock.mockResolvedValue({ aggregate: 'pass', checks: [] });

    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=testtoken1234');

    // Must not throw — error is caught and logged
    await expect(
      manager.startReview({ kind: 'github', url: 'https://github.com/octocat/hello/pull/42' })
    ).resolves.toBeDefined();

    // ciChecks still attempted independently
    expect(fetchCIChecksMock).toHaveBeenCalledTimes(1);
  });

  it('logger.warns but does not throw when fetchCIChecks rejects (T-3-12)', async () => {
    fetchExistingCommentsMock.mockResolvedValue([]);
    fetchCIChecksMock.mockRejectedValue(new Error('checks api failed'));

    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=testtoken1234');

    await expect(
      manager.startReview({ kind: 'github', url: 'https://github.com/octocat/hello/pull/42' })
    ).resolves.toBeDefined();
  });

  it('fires Phase 3 events AFTER the initial snapshot is persisted (ordering invariant)', async () => {
    fetchExistingCommentsMock.mockResolvedValue([]);
    fetchCIChecksMock.mockResolvedValue({ aggregate: 'none', checks: [] });

    const manager = new SessionManager({ sessionToken: 'testtoken1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=testtoken1234');

    const order: string[] = [];
    const storeMod = await import('../../persist/store.js');
    vi.mocked(storeMod.writeState).mockImplementation(async () => {
      order.push('writeState');
    });
    const applyEventSpy = vi.spyOn(manager, 'applyEvent');
    applyEventSpy.mockImplementation(async (_id, event) => {
      order.push(`applyEvent:${(event as { type: string }).type}`);
      return {} as never;
    });

    await manager.startReview({ kind: 'github', url: 'https://github.com/octocat/hello/pull/42' });

    // writeState (initial snapshot) must precede both phase-3 applyEvent calls
    const writeIdx = order.indexOf('writeState');
    const existingIdx = order.indexOf('applyEvent:existingComments.loaded');
    const ciIdx = order.indexOf('applyEvent:ciChecks.loaded');
    expect(writeIdx).toBeGreaterThanOrEqual(0);
    expect(existingIdx).toBeGreaterThan(writeIdx);
    expect(ciIdx).toBeGreaterThan(writeIdx);
  });
});
