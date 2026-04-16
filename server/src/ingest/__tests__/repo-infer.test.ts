import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('execa', () => ({ execa: vi.fn() }));

describe('inferRepoFromCwd', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls gh repo view --json name,owner and returns {owner, name}', async () => {
    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockResolvedValue({
      stdout: JSON.stringify({ name: 'repo', owner: { login: 'o' } }),
    });

    const { inferRepoFromCwd } = await import('../repo-infer.js');
    const result = await inferRepoFromCwd('/some/dir');

    expect(result).toEqual({ owner: 'o', name: 'repo' });

    const calls = (execa as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe('gh');
    expect(calls[0][1]).toEqual(['repo', 'view', '--json', 'name,owner']);
  });

  it('throws a friendly error containing "current directory" on execa failure', async () => {
    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('execa failed'));

    const { inferRepoFromCwd } = await import('../repo-infer.js');
    await expect(inferRepoFromCwd('/some/dir')).rejects.toThrow(
      /current directory|not a git repo|PR URL/i
    );
  });

  it('throws a friendly error if JSON shape is wrong (missing owner.login)', async () => {
    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockResolvedValue({
      stdout: JSON.stringify({ name: 'repo', owner: {} }),
    });

    const { inferRepoFromCwd } = await import('../repo-infer.js');
    await expect(inferRepoFromCwd('/some/dir')).rejects.toThrow();
  });
});
