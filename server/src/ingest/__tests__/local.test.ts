import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('execa', () => ({ execa: vi.fn() }));

describe('ingestLocal', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls rev-parse for BOTH refs before git diff', async () => {
    const { execa } = await import('execa');
    const callOrder: string[][] = [];

    (execa as ReturnType<typeof vi.fn>).mockImplementation(
      (_bin: string, args: string[], _opts?: unknown) => {
        callOrder.push(args);
        if (args[0] === 'rev-parse' && args[2] === 'main') {
          return Promise.resolve({ stdout: 'abc123' });
        }
        if (args[0] === 'rev-parse' && args[2] === 'feat/x') {
          return Promise.resolve({ stdout: 'def456' });
        }
        if (args[0] === 'diff') {
          return Promise.resolve({ stdout: 'diff --git a/foo.ts b/foo.ts\n' });
        }
        return Promise.reject(new Error('unexpected call'));
      }
    );

    const { ingestLocal } = await import('../local.js');
    const result = await ingestLocal('main', 'feat/x', '/some/repo');

    // Both rev-parse calls must appear before the diff call
    const revParseIndices = callOrder
      .map((args, idx) => (args[0] === 'rev-parse' ? idx : -1))
      .filter((i) => i >= 0);
    const diffIndex = callOrder.findIndex((args) => args[0] === 'diff');

    expect(revParseIndices.length).toBe(2);
    expect(diffIndex).toBeGreaterThan(revParseIndices[0]);
    expect(diffIndex).toBeGreaterThan(revParseIndices[1]);
  });

  it('uses exact argv arrays including three-dot diff per D-16', async () => {
    const { execa } = await import('execa');

    (execa as ReturnType<typeof vi.fn>).mockImplementation(
      (_bin: string, args: string[]) => {
        if (args[0] === 'rev-parse') return Promise.resolve({ stdout: 'sha-result' });
        if (args[0] === 'diff') return Promise.resolve({ stdout: 'diff text' });
        return Promise.reject(new Error('unexpected call'));
      }
    );

    const { ingestLocal } = await import('../local.js');
    await ingestLocal('main', 'feat/x', '/repo');

    const calls = (execa as ReturnType<typeof vi.fn>).mock.calls;

    const revParseMain = calls.find(
      ([_b, args]: [string, string[]]) =>
        args[0] === 'rev-parse' && args[1] === '--verify' && args[2] === 'main'
    );
    const revParseFeat = calls.find(
      ([_b, args]: [string, string[]]) =>
        args[0] === 'rev-parse' && args[1] === '--verify' && args[2] === 'feat/x'
    );
    const diffCall = calls.find(
      ([_b, args]: [string, string[]]) => args[0] === 'diff'
    );

    expect(revParseMain).toBeDefined();
    expect(revParseMain[0]).toBe('git');
    expect(revParseMain[1]).toEqual(['rev-parse', '--verify', 'main']);

    expect(revParseFeat).toBeDefined();
    expect(revParseFeat[0]).toBe('git');
    expect(revParseFeat[1]).toEqual(['rev-parse', '--verify', 'feat/x']);

    expect(diffCall).toBeDefined();
    expect(diffCall[0]).toBe('git');
    // Three-dot diff per D-16
    expect(diffCall[1]).toEqual(['diff', 'main...feat/x']);
  });

  it('returns baseSha and headSha from rev-parse results', async () => {
    const { execa } = await import('execa');

    (execa as ReturnType<typeof vi.fn>).mockImplementation(
      (_bin: string, args: string[]) => {
        if (args[0] === 'rev-parse' && args[2] === 'main')
          return Promise.resolve({ stdout: 'abc123\n' });
        if (args[0] === 'rev-parse' && args[2] === 'HEAD')
          return Promise.resolve({ stdout: 'def456\n' });
        if (args[0] === 'diff') return Promise.resolve({ stdout: 'diff text' });
        return Promise.reject(new Error('unexpected call'));
      }
    );

    const { ingestLocal } = await import('../local.js');
    const result = await ingestLocal('main', 'HEAD', '/repo');
    expect(result.baseSha).toBe('abc123');
    expect(result.headSha).toBe('def456');
    expect(result.diffText).toBe('diff text');
  });

  it('if either rev-parse fails, git diff is NEVER called (fail-fast)', async () => {
    const { execa } = await import('execa');
    const revParseError = Object.assign(new Error('bad ref'), {
      stderr: 'unknown revision or path not in the working tree',
    });

    (execa as ReturnType<typeof vi.fn>).mockImplementation(
      (_bin: string, args: string[]) => {
        if (args[0] === 'rev-parse') return Promise.reject(revParseError);
        return Promise.resolve({ stdout: 'diff text' });
      }
    );

    const { ingestLocal } = await import('../local.js');
    await expect(ingestLocal('bad-ref', 'HEAD', '/repo')).rejects.toThrow();

    const calls = (execa as ReturnType<typeof vi.fn>).mock.calls;
    const diffCalls = calls.filter(([_b, args]: [string, string[]]) => args[0] === 'diff');
    expect(diffCalls.length).toBe(0);
  });

  it('maps "not a git repository" to a friendly error', async () => {
    const { execa } = await import('execa');
    const gitError = Object.assign(new Error('not a repo'), {
      stderr: 'fatal: not a git repository',
    });
    (execa as ReturnType<typeof vi.fn>).mockRejectedValue(gitError);

    const { ingestLocal } = await import('../local.js');
    await expect(ingestLocal('main', 'HEAD', '/not-a-repo')).rejects.toThrow(
      /not.*git repo/i
    );
  });
});
