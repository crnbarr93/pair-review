import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('store crash-interrupt (SESS-03)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-crash-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('kill -9 during writeState loop leaves state.json valid JSON (5 iterations)', async () => {
    for (let iter = 0; iter < 5; iter++) {
      // Fresh tmpDir per iteration — beforeEach runs once per `it`, so reset manually.
      const iterDir = await fs.mkdtemp(path.join(os.tmpdir(), `store-crash-iter-${iter}-`));
      try {
        const safePrKey = 'gh_test_crash_1';
        const stateFile = path.join(iterDir, 'reviews', safePrKey, 'state.json');
        await fs.mkdir(path.dirname(stateFile), { recursive: true });
        // Seed a known-good state — proves an un-advanced file still parses.
        await fs.writeFile(stateFile, JSON.stringify({ lastEventId: 0, seeded: true }));

        const child = spawn(
          'node',
          ['--import', 'tsx/esm', path.resolve(__dirname, 'crash-fixture.ts')],
          {
            env: {
              ...process.env,
              CLAUDE_PLUGIN_DATA: iterDir,
              // sanitization: replace(/[/#:\\]/g, '_') maps this to 'gh_test_crash_1'
              CRASH_PR_KEY: 'gh:test/crash#1',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );

        // Capture stderr for diagnostics if the fixture throws.
        const stderrChunks: Buffer[] = [];
        child.stderr?.on('data', (c: Buffer) => stderrChunks.push(c));

        // Variable wait time across iterations: 100 / 130 / 160 / 190 / 220 ms.
        // Deliberately crosses several full write+rename cycles so SIGKILL can
        // land at any stage of a writeState call.
        const waitMs = 100 + iter * 30;
        await new Promise((r) => setTimeout(r, waitMs));
        child.kill('SIGKILL');

        // Wait for OS to reap the PID before we read.
        await new Promise<void>((r) => child.on('exit', () => r()));

        // Parent reads + asserts.
        const raw = await fs.readFile(stateFile, 'utf8');
        const stderrOut = Buffer.concat(stderrChunks).toString();
        expect(() => JSON.parse(raw), `iteration ${iter} stderr: ${stderrOut}\nraw: ${raw}`).not.toThrow();
        const parsed = JSON.parse(raw) as { lastEventId: number };
        expect(typeof parsed.lastEventId).toBe('number');
        expect(parsed.lastEventId).toBeGreaterThanOrEqual(0);
      } finally {
        await fs.rm(iterDir, { recursive: true, force: true });
      }
    }
  }, 20_000);
});
