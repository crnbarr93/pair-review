import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReviewSession } from '@shared/types';

// Mock launchBrowser to avoid real browser opening
vi.mock('../../browser-launch.js', () => ({
  launchBrowser: vi.fn(async () => undefined),
}));

// Mock writeState + readState (configurable per test)
vi.mock('../../persist/store.js', () => ({
  writeState: vi.fn(async () => undefined),
  readState: vi.fn(async () => null),
}));

// Mock ingest adapters — both ingest fn and fetchCurrentHeadSha
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

vi.mock('../../highlight/shiki.js', () => ({
  highlightHunks: vi.fn(async () => []),
}));

// Mock node:fs for resetSession unlink
vi.mock('node:fs', () => ({
  promises: {
    unlink: vi.fn(async () => undefined),
  },
}));

function makePersistedSession(prKey: string, overrides: Partial<ReviewSession> = {}): ReviewSession {
  return {
    prKey,
    pr: {
      source: 'github',
      title: 'Persisted PR',
      description: 'desc',
      author: 'testuser',
      baseBranch: 'main',
      headBranch: 'feat/x',
      baseSha: 'abc000',
      headSha: 'stored-sha',
      additions: 0,
      deletions: 0,
      filesChanged: 0,
      owner: 'o',
      repo: 'r',
      number: 1,
    },
    diff: { files: [], totalHunks: 0 },
    shikiTokens: {},
    createdAt: '2026-04-19T00:00:00Z',
    headSha: 'stored-sha',
    error: null,
    lastEventId: 3,
    ...overrides,
  };
}

describe('SessionManager disk-load resume (startReview path 2)', () => {
  let SessionManager: typeof import('../manager.js').SessionManager;
  let readStateMock: ReturnType<typeof vi.fn>;
  let writeStateMock: ReturnType<typeof vi.fn>;
  let launchBrowserMock: ReturnType<typeof vi.fn>;
  let fetchGithubHeadShaMock: ReturnType<typeof vi.fn>;
  let ingestGithubMock: ReturnType<typeof vi.fn>;
  let fsUnlinkMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const managerMod = await import('../manager.js');
    SessionManager = managerMod.SessionManager;
    const storeMod = await import('../../persist/store.js');
    readStateMock = vi.mocked(storeMod.readState);
    writeStateMock = vi.mocked(storeMod.writeState);
    const launchMod = await import('../../browser-launch.js');
    launchBrowserMock = vi.mocked(launchMod.launchBrowser);
    const ghMod = await import('../../ingest/github.js');
    fetchGithubHeadShaMock = vi.mocked(ghMod.fetchCurrentHeadSha);
    ingestGithubMock = vi.mocked(ghMod.ingestGithub);
    const fsMod = await import('node:fs');
    fsUnlinkMock = vi.mocked(fsMod.promises.unlink);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // derivePrKey(number:1) with inferRepoFromCwd mock → gh:test-owner/test-repo#1
  const DERIVED_PR_KEY = 'gh:test-owner/test-repo#1';

  it('disk-load-1: returns persisted session when in-memory is empty, calls launchBrowser', async () => {
    const persisted = makePersistedSession(DERIVED_PR_KEY, { headSha: 'def111' });
    readStateMock.mockResolvedValueOnce(persisted);
    fetchGithubHeadShaMock.mockResolvedValueOnce('def111');

    const manager = new SessionManager({ sessionToken: 'tt1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=tt1234');

    const session = await manager.startReview({ kind: 'github', number: 1 });

    expect(session.prKey).toBe(DERIVED_PR_KEY);
    expect(session.lastEventId).toBe(3); // preserved
    expect(session.staleDiff).toBeUndefined(); // same sha
    expect(launchBrowserMock).toHaveBeenCalledTimes(1);
    // Ingest should NOT have been re-run on the disk-load path
    expect(ingestGithubMock).not.toHaveBeenCalled();
  });

  it('disk-load-2: legacy Phase-1 state.json without lastEventId is restored as lastEventId=0', async () => {
    const persisted = makePersistedSession(DERIVED_PR_KEY, { headSha: 'def111' });
    // simulate legacy file: strip lastEventId
    const legacy = { ...persisted };
    delete (legacy as { lastEventId?: number }).lastEventId;
    readStateMock.mockResolvedValueOnce(legacy);
    fetchGithubHeadShaMock.mockResolvedValueOnce('def111');

    const manager = new SessionManager({ sessionToken: 'tt1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=tt1234');

    const session = await manager.startReview({ kind: 'github', number: 1 });
    expect(session.lastEventId).toBe(0);
  });

  it('disk-load-3: same sha → staleDiff is undefined', async () => {
    const persisted = makePersistedSession(DERIVED_PR_KEY, { headSha: 'def111' });
    readStateMock.mockResolvedValueOnce(persisted);
    fetchGithubHeadShaMock.mockResolvedValueOnce('def111');

    const manager = new SessionManager({ sessionToken: 'tt1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=tt1234');

    const session = await manager.startReview({ kind: 'github', number: 1 });
    expect(session.staleDiff).toBeUndefined();
  });

  it('disk-load-4: divergent sha → staleDiff populated with storedSha + currentSha', async () => {
    const persisted = makePersistedSession(DERIVED_PR_KEY, { headSha: 'old-sha' });
    readStateMock.mockResolvedValueOnce(persisted);
    fetchGithubHeadShaMock.mockResolvedValueOnce('new-sha');

    const manager = new SessionManager({ sessionToken: 'tt1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=tt1234');

    const session = await manager.startReview({ kind: 'github', number: 1 });
    expect(session.staleDiff).toEqual({ storedSha: 'old-sha', currentSha: 'new-sha' });
  });

  it('disk-load-5: fetchCurrentHeadSha throws → session.error populated with head-sha-check-failed; staleDiff undefined', async () => {
    const persisted = makePersistedSession(DERIVED_PR_KEY, { headSha: 'stored-sha' });
    readStateMock.mockResolvedValueOnce(persisted);
    fetchGithubHeadShaMock.mockRejectedValueOnce(new Error('gh network blip'));

    const manager = new SessionManager({ sessionToken: 'tt1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=tt1234');

    const session = await manager.startReview({ kind: 'github', number: 1 });
    expect(session.staleDiff).toBeUndefined();
    expect(session.error).not.toBeNull();
    expect(session.error?.message).toMatch(/head-sha-check-failed/);
  });

  it('reset-1: resetSession deletes state.json, clears in-memory, re-runs ingest', async () => {
    const persisted = makePersistedSession(DERIVED_PR_KEY, { headSha: 'def111' });
    // First startReview: disk-load path populates in-memory
    readStateMock.mockResolvedValueOnce(persisted);
    fetchGithubHeadShaMock.mockResolvedValueOnce('def111');

    const manager = new SessionManager({ sessionToken: 'tt1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=tt1234');

    const before = await manager.startReview({ kind: 'github', number: 1 });
    expect(manager.get(DERIVED_PR_KEY)).toBe(before);

    // Prep: after resetSession, startReview's disk-load path sees null, falls to ingest
    readStateMock.mockResolvedValueOnce(null);

    const fresh = await manager.resetSession(DERIVED_PR_KEY, { kind: 'github', number: 1 });

    expect(fsUnlinkMock).toHaveBeenCalled();
    expect(ingestGithubMock).toHaveBeenCalled(); // ingest re-run
    expect(fresh.prKey).toBe(DERIVED_PR_KEY);
    expect(fresh.lastEventId).toBe(0); // fresh session
    expect(manager.get(DERIVED_PR_KEY)).toBe(fresh);
  });
});
