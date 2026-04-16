import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
});
