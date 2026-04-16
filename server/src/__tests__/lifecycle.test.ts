import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..', '..');
const entryPoint = path.join(serverRoot, 'src', 'index.ts');

describe('Server lifecycle', () => {
  it('boots, prints http://127.0.0.1:<port> to stderr, and exits cleanly on SIGTERM', async () => {
    const stderrChunks: Buffer[] = [];
    const stdoutChunks: Buffer[] = [];

    const proc = execa('node', ['--import', 'tsx/esm', entryPoint], {
      cwd: serverRoot,
      reject: false,
      env: {
        ...process.env,
        // Prevent actual browser launch during tests
        BROWSER: 'none',
        CLAUDE_PLUGIN_DATA: path.join(serverRoot, '.test-tmp-state'),
      },
    });

    // Collect output streams immediately after spawning
    proc.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    proc.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));

    // Wait up to 4 seconds for the URL to appear in stderr
    const urlPattern = /http:\/\/127\.0\.0\.1:\d{4,5}/;
    let urlFound = false;
    const urlDeadline = Date.now() + 4000;

    while (Date.now() < urlDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const stderrSoFar = Buffer.concat(stderrChunks).toString();
      if (urlPattern.test(stderrSoFar)) {
        urlFound = true;
        break;
      }
    }

    // Send SIGTERM and wait for clean exit (up to 3s)
    proc.kill('SIGTERM');

    const result = await Promise.race([
      proc,
      new Promise<{ exitCode: number | null }>((resolve) =>
        setTimeout(() => resolve({ exitCode: -1 }), 3000)
      ),
    ]).catch((err: { exitCode?: number }) => ({ exitCode: err.exitCode ?? 1 }));

    const stderrOutput = Buffer.concat(stderrChunks).toString();
    const stdoutOutput = Buffer.concat(stdoutChunks).toString();

    expect(urlFound, `Expected stderr to contain http://127.0.0.1:<port> within 4s.\nGot: ${stderrOutput}`).toBe(true);
    expect(
      stdoutOutput,
      `Expected stdout to be empty (MCP JSON-RPC channel).\nGot: ${stdoutOutput}`
    ).toBe('');
    expect(
      (result as { exitCode: number | null }).exitCode,
      'Expected exit code 0 on SIGTERM'
    ).toBe(0);
  }, 12000); // 12s timeout for the whole lifecycle test
});
