import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';

// Mock browser launch — we don't want actual browsers opening during tests
vi.mock('../../browser-launch.js', () => ({
  launchBrowser: vi.fn(async () => undefined),
}));

// Mock writeState to avoid filesystem I/O — point at tmpdir if needed
vi.mock('../../persist/store.js', () => ({
  writeState: vi.fn(async () => undefined),
  readState: vi.fn(async () => null),
}));

async function makeRepo(): Promise<string> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gitrev-'));
  await execa('git', ['init', '-q'], { cwd: dir });
  await execa('git', ['config', 'user.email', 't@t.com'], { cwd: dir });
  await execa('git', ['config', 'user.name', 'Test'], { cwd: dir });
  // First commit
  writeFileSync(path.join(dir, 'a.ts'), 'export const x = 1;\n');
  await execa('git', ['add', '.'], { cwd: dir });
  await execa('git', ['commit', '-qm', 'c1'], { cwd: dir });
  // Second commit with changes
  writeFileSync(path.join(dir, 'a.ts'), 'export const x = 2;\nexport const y = 3;\n');
  writeFileSync(path.join(dir, 'b.ts'), 'export const b = 1;\n');
  await execa('git', ['add', '.'], { cwd: dir });
  await execa('git', ['commit', '-qm', 'c2'], { cwd: dir });
  return dir;
}

describe('SessionManager integration (real git repo)', () => {
  let repoDir: string;
  let origCwd: string;

  beforeAll(async () => {
    repoDir = await makeRepo();
    origCwd = process.cwd();
    process.chdir(repoDir);
  }, 30000);

  afterAll(() => {
    process.chdir(origCwd);
  });

  it('startReview with local source produces a real ReviewSession', async () => {
    const { SessionManager } = await import('../manager.js');
    const { launchBrowser } = await import('../../browser-launch.js');
    const launchMock = vi.mocked(launchBrowser);
    launchMock.mockClear();

    const manager = new SessionManager({ sessionToken: 'integration-test-token' });
    manager.setLaunchUrl('http://127.0.0.1:9999/?token=integration-test-token');

    const session = await manager.startReview({
      kind: 'local',
      base: 'HEAD~1',
      head: 'HEAD',
    });

    // Real diff files
    expect(session.diff.files.length).toBeGreaterThanOrEqual(1);

    // Every hunk has opaque ID per D-17
    for (const file of session.diff.files) {
      for (const hunk of file.hunks) {
        expect(hunk.id).toMatch(/^[0-9a-f]{12}:h\d+$/);
      }
    }

    // shikiTokens has an entry for every non-binary file
    for (const file of session.diff.files) {
      if (!file.binary) {
        expect(session.shikiTokens[file.id]).toBeDefined();
        expect(session.shikiTokens[file.id]).toBeInstanceOf(Array);
      }
    }

    // Session is accessible via get()
    expect(manager.get(session.prKey)).toBe(session);

    // prKey has local shape
    expect(session.prKey).toMatch(/^local:[0-9a-f]{64}$/);

    // Browser launched exactly once
    expect(launchMock).toHaveBeenCalledTimes(1);
  }, 30000);

  it('second call with identical source returns same session (idempotency D-21)', async () => {
    const { SessionManager } = await import('../manager.js');
    const { launchBrowser } = await import('../../browser-launch.js');
    const launchMock = vi.mocked(launchBrowser);
    launchMock.mockClear();

    const manager = new SessionManager({ sessionToken: 'integration-test-token-2' });
    manager.setLaunchUrl('http://127.0.0.1:9999/?token=integration-test-token-2');

    const source = { kind: 'local' as const, base: 'HEAD~1', head: 'HEAD' };
    const session1 = await manager.startReview(source);
    const session2 = await manager.startReview(source);

    expect(session1).toBe(session2);
    // Browser launched only once across both calls
    expect(launchMock).toHaveBeenCalledTimes(1);
  }, 30000);

  it('shikiTokens has at least one entry (for a.ts)', async () => {
    const { SessionManager } = await import('../manager.js');

    const manager = new SessionManager({ sessionToken: 'integration-test-token-3' });
    manager.setLaunchUrl('http://127.0.0.1:9999/?token=integration-test-token-3');

    const session = await manager.startReview({
      kind: 'local',
      base: 'HEAD~1',
      head: 'HEAD',
    });

    const tokenKeys = Object.keys(session.shikiTokens);
    expect(tokenKeys.length).toBeGreaterThan(0);
  }, 30000);
});
