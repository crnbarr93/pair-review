import { describe, it, expect, afterAll } from 'vitest';
import { execa } from 'execa';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../');

describe('Phase 1 end-to-end', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let child: any = null;
  let repoDir = '';

  async function makeRepo() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gitrev-e2e-'));
    await execa('git', ['init', '-q'], { cwd: dir });
    await execa('git', ['config', 'user.email', 't@t'], { cwd: dir });
    await execa('git', ['config', 'user.name', 't'], { cwd: dir });
    writeFileSync(path.join(dir, 'a.ts'), 'export const x = 1;\n');
    await execa('git', ['add', '.'], { cwd: dir });
    await execa('git', ['commit', '-qm', 'c1'], { cwd: dir });
    writeFileSync(path.join(dir, 'a.ts'), 'export const x = 2;\n');
    await execa('git', ['add', '.'], { cwd: dir });
    await execa('git', ['commit', '-qm', 'c2'], { cwd: dir });
    return dir;
  }

  afterAll(() => {
    if (child) {
      try {
        child.kill('SIGTERM');
      } catch {
        // process may already be dead
      }
    }
  });

  it('boots, handles start_review via stdio, passes security probes, shuts down on SIGTERM', async () => {
    repoDir = await makeRepo();
    const serverBin = path.join(REPO_ROOT, 'server/dist/index.js');

    child = execa('node', [serverBin], {
      cwd: repoDir,
      env: { ...process.env, CLAUDE_PLUGIN_DATA: path.join(repoDir, '.plugin-data') },
      reject: false,
      buffer: false,
    });

    // Read stderr until we see the listen URL (or 5s timeout)
    let stderrBuf = '';
    const listenUrlPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout waiting for listen URL')), 5000);
      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        const m = stderrBuf.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (m) {
          clearTimeout(timeout);
          resolve(m[0]!);
        }
      });
    });
    const listenUrl = await listenUrlPromise;
    expect(listenUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const portMatch = listenUrl.match(/:(\d+)$/);
    const port = parseInt(portMatch![1]!, 10);

    // Send MCP initialize + tools/call via stdin
    const requests = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          clientInfo: { name: 'e2e', version: '0' },
          capabilities: {},
        },
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'start_review',
          arguments: { source: { kind: 'local', base: 'HEAD~1', head: 'HEAD' } },
        },
      },
    ];
    for (const r of requests) {
      child.stdin.write(JSON.stringify(r) + '\n');
    }

    // Collect stdout responses until we see id=2
    let stdoutBuf = '';
    const toolResultPromise = new Promise<{ content: Array<{ type: string; text: string }> }>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(
              new Error(
                'timeout waiting for tools/call result. stderr: ' + stderrBuf.slice(-500)
              )
            ),
          15000
        );
        child.stdout.on('data', (chunk: Buffer) => {
          stdoutBuf += chunk.toString();
          for (const line of stdoutBuf.split('\n')) {
            try {
              const parsed = JSON.parse(line) as { id?: number; result?: unknown };
              if (parsed.id === 2 && parsed.result) {
                clearTimeout(timeout);
                resolve(parsed.result as { content: Array<{ type: string; text: string }> });
                return;
              }
            } catch {
              // partial line, continue
            }
          }
        });
      }
    );
    const result = await toolResultPromise;

    expect(result.content?.[0]?.text ?? '').toMatch(
      /Review open at: http:\/\/127\.0\.0\.1:\d+\/\?token=/
    );

    // Verify the server is reachable (GET / returns 200 with HTML content)
    const healthCheck = await execa(
      'curl',
      ['-s', '-o', '/dev/null', '-w', '%{http_code}', `http://127.0.0.1:${port}/`],
      { reject: false }
    );
    expect(healthCheck.stdout).toBe('200');

    // Security probes against the live server
    const probeScript = path.join(REPO_ROOT, 'scripts/security-probes.sh');
    const probe = await execa('bash', [probeScript, String(port)], { reject: false });
    expect(probe.exitCode).toBe(0);

    // SIGTERM shuts down cleanly
    child.kill('SIGTERM');
    const exitCode = await new Promise<number>((resolve) => {
      child.on('exit', (c: number | null) => resolve(c ?? 1));
    });
    expect(exitCode).toBe(0);
    child = null;
  }, 30000);
});
