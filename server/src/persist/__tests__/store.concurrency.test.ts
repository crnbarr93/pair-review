import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;

describe('writeState concurrency (SESS-03 companion)', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-concur-'));
    vi.stubEnv('CLAUDE_PLUGIN_DATA', tmpDir);
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // Widened budget for concurrency probes — production keeps the tight 150ms
  // default (see Plan 02 Task 1). Tests 2 and 3 deliberately DO NOT use this
  // override so they exercise the production-tight default path.
  const WIDE_LOCK = {
    retries: { retries: 20, minTimeout: 100 },
    realpath: false,
    stale: 10_000,
  } as const;

  it('two concurrent writeState calls on same prKey both resolve; result is one of the two payloads (not interleaved)', async () => {
    const { writeState } = await import('../store.js');
    const results = await Promise.allSettled([
      writeState('gh:o/r#1', { n: 1, marker: 'A' }, WIDE_LOCK),
      writeState('gh:o/r#1', { n: 2, marker: 'B' }, WIDE_LOCK),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const raw = await fs.readFile(
      path.join(tmpDir, 'reviews', 'gh_o_r_1', 'state.json'),
      'utf8',
    );
    // Parse-then-equal also guarantees valid JSON.
    const parsed = JSON.parse(raw) as { n: number; marker: string };
    expect(parsed).toBeDefined();
    // Either A won the race or B won — never a mixed payload.
    expect([
      JSON.stringify({ n: 1, marker: 'A' }, null, 2),
      JSON.stringify({ n: 2, marker: 'B' }, null, 2),
    ]).toContain(raw);
  });

  it('concurrent writes to different prKeys run in parallel', async () => {
    const { writeState } = await import('../store.js');
    const t0 = performance.now();
    await Promise.all([
      writeState('gh:o/r#1', { a: 1 }),
      writeState('gh:o/r#2', { b: 2 }),
    ]);
    const elapsed = performance.now() - t0;
    // Two independent locks — should finish well under a serial bound.
    expect(elapsed).toBeLessThan(500);

    const [raw1, raw2] = await Promise.all([
      fs.readFile(path.join(tmpDir, 'reviews', 'gh_o_r_1', 'state.json'), 'utf8'),
      fs.readFile(path.join(tmpDir, 'reviews', 'gh_o_r_2', 'state.json'), 'utf8'),
    ]);
    expect(JSON.parse(raw1)).toEqual({ a: 1 });
    expect(JSON.parse(raw2)).toEqual({ b: 2 });
  });

  it('10 serial writes to same prKey produce the last-written value', async () => {
    const { writeState } = await import('../store.js');
    for (let i = 1; i <= 10; i++) {
      await writeState('gh:o/r#serial', { n: i });
    }
    const raw = await fs.readFile(
      path.join(tmpDir, 'reviews', 'gh_o_r_serial', 'state.json'),
      'utf8',
    );
    expect(JSON.parse(raw)).toEqual({ n: 10 });
  });
});
