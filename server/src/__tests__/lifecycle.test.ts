import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..', '..');
const entryPoint = path.join(serverRoot, 'src', 'index.ts');

describe('Server lifecycle', () => {
  it('boots, prints http://127.0.0.1:<port> to stderr, and exits cleanly on SIGTERM', async () => {
    const proc = execa('node', ['--import', 'tsx/esm', entryPoint], {
      cwd: serverRoot,
      reject: false,
      all: true,
      env: {
        ...process.env,
        // Prevent actual browser launch during tests
        BROWSER: 'none',
      },
    });

    // Wait up to 4 seconds for the server to print its URL
    let stderrOutput = '';
    const urlPattern = /http:\/\/127\.0\.0\.1:\d{4,5}/;
    let urlFound = false;

    const deadline = Date.now() + 4000;

    // Poll stderr every 100ms
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const partialResult = await Promise.race([
        proc,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 0)),
      ]).catch(() => null);

      if (partialResult !== null) {
        // Process already exited — unexpected early exit
        break;
      }

      // Check if we can get stderr from the process
      // We use proc.stderr to stream
      if (proc.stderr) {
        // Collect any buffered stderr
        break; // We'll rely on the process.all stream below
      }
    }

    // Use a different approach: collect output using readable streams
    const stderrChunks: Buffer[] = [];
    const stdoutChunks: Buffer[] = [];

    if (proc.stderr) {
      proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    }
    if (proc.stdout) {
      proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    }

    // Wait up to 3 seconds for URL to appear in stderr
    const urlDeadline = Date.now() + 3000;
    while (Date.now() < urlDeadline) {
      stderrOutput = Buffer.concat(stderrChunks).toString();
      if (urlPattern.test(stderrOutput)) {
        urlFound = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Send SIGTERM and wait for clean exit
    proc.kill('SIGTERM');

    const result = await Promise.race([
      proc,
      new Promise<{ exitCode: number | null }>((resolve) =>
        setTimeout(() => resolve({ exitCode: -1 }), 3000)
      ),
    ]).catch((err: { exitCode?: number }) => ({ exitCode: err.exitCode ?? 1 }));

    const stdoutOutput = Buffer.concat(stdoutChunks).toString();

    expect(urlFound, `Expected stderr to contain http://127.0.0.1:<port> within 3s. Got: ${stderrOutput}`).toBe(true);
    expect(
      stdoutOutput,
      `Expected stdout to be empty (MCP JSON-RPC channel). Got: ${stdoutOutput}`
    ).toBe('');
    expect(
      (result as { exitCode: number | null }).exitCode,
      'Expected exit code 0 on SIGTERM'
    ).toBe(0);
  }, 10000); // 10s timeout for the whole lifecycle test
});
