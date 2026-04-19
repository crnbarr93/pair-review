import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;

describe('writeState stale-lockfile recovery (SESS-03 companion)', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-stalelock-'));
    vi.stubEnv('CLAUDE_PLUGIN_DATA', tmpDir);
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('breaks a stale lockdir (mtime 30s old) and completes writeState', async () => {
    const safePrKey = 'gh_o_r_1';
    const stateFile = path.join(tmpDir, 'reviews', safePrKey, 'state.json');
    const lockDir = `${stateFile}.lock`;
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(stateFile, JSON.stringify({ seeded: true }));

    // Plant a stale lockdir (proper-lockfile stores its lock as a sibling
    // directory next to the target file).
    await fs.mkdir(lockDir);
    // Backdate mtime by 30 seconds (3x the 10s stale threshold).
    const thirtySecondsAgo = new Date(Date.now() - 30_000);
    await fs.utimes(lockDir, thirtySecondsAgo, thirtySecondsAgo);

    const { writeState, readState } = await import('../store.js');

    // Widened budget (~2s total) so proper-lockfile's stale-detection has time
    // to run its break cycle. The production-tight default (~150ms) is
    // categorically too narrow — see Plan 02 Task 1 for why we expose the override.
    const WIDE_LOCK = {
      retries: { retries: 20, minTimeout: 100 },
      realpath: false,
      stale: 10_000,
    } as const;

    const t0 = performance.now();
    await writeState('gh:o/r#1', { fresh: true }, WIDE_LOCK);
    const elapsed = performance.now() - t0;

    // Generous bound for stale-detection + retry backoff.
    expect(elapsed).toBeLessThan(3000);

    const back = await readState('gh:o/r#1');
    expect(back).toEqual({ fresh: true });
  });
});
