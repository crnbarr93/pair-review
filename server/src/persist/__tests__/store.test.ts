import { describe, it, expect, beforeEach, afterEach, vi, expectTypeOf } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type lockfile from 'proper-lockfile';

let tmpDir: string;

describe('writeState / readState', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-test-'));
    // Stub env so stateFilePath resolves inside our tmpDir
    vi.stubEnv('CLAUDE_PLUGIN_DATA', tmpDir);
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.doUnmock('proper-lockfile');
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writeState creates file with valid JSON content', async () => {
    const { writeState } = await import('../store.js');
    await writeState('gh:o/r#1', { foo: 1 });

    // Find the file that was created
    const expectedSafePrKey = 'gh_o_r_1';
    const filePath = path.join(tmpDir, 'reviews', expectedSafePrKey, 'state.json');
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({ foo: 1 });
  });

  it('readState round-trips the written object', async () => {
    const { writeState, readState } = await import('../store.js');
    const data = { name: 'test', count: 42 };
    await writeState('gh:o/r#2', data);
    const result = await readState('gh:o/r#2');
    expect(result).toEqual(data);
  });

  it('readState returns null when file does not exist', async () => {
    const { readState } = await import('../store.js');
    const result = await readState('gh:nonexistent/pr#999');
    expect(result).toBeNull();
  });

  it('writeState creates parent directories recursively', async () => {
    const { writeState } = await import('../store.js');
    await writeState('local:abc123', { created: true });
    // If no error thrown, directories were created
    const expectedSafePrKey = 'local_abc123';
    const filePath = path.join(tmpDir, 'reviews', expectedSafePrKey, 'state.json');
    const stat = await fs.stat(filePath);
    expect(stat.isFile()).toBe(true);
  });

  // --- Plan 02-02 Task 1: signature widening (3 new tests) ---

  it('writeState with no lockOptions preserves Phase-1 behavior (tight default)', async () => {
    const { writeState, readState } = await import('../store.js');
    // Plain two-arg call — no lockOptions — must still succeed.
    await writeState('gh:o/r#noopts', { n: 1 });
    const back = await readState('gh:o/r#noopts');
    expect(back).toEqual({ n: 1 });
  });

  it('writeState with lockOptions forwards them verbatim to lockfile.lock', async () => {
    // Mock proper-lockfile to observe the second argument.
    const lockMock = vi.fn(async () => async () => undefined);
    vi.doMock('proper-lockfile', () => ({
      default: { lock: lockMock },
    }));
    vi.resetModules();

    const { writeState } = await import('../store.js');
    const overrideOptions = {
      retries: { retries: 20, minTimeout: 100 },
      realpath: false,
      stale: 10_000,
    };
    await writeState('gh:o/r#fwd', { n: 1 }, overrideOptions);

    // Exactly one lock acquisition for the single writeState call.
    expect(lockMock).toHaveBeenCalledTimes(1);
    // The second argument must be the override object verbatim (no merge / no mutation).
    expect(lockMock.mock.calls[0][1]).toEqual(overrideOptions);
  });

  it('WriteStateLockOptions equals Parameters<typeof lockfile.lock>[1]', async () => {
    const mod = await import('../store.js');
    type Exported = typeof mod extends { WriteStateLockOptions: unknown }
      ? never
      : import('../store.js').WriteStateLockOptions;
    expectTypeOf<Exported>().toEqualTypeOf<Parameters<typeof lockfile.lock>[1]>();
  });
});
