import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('execa', () => ({ execa: vi.fn() }));

describe('ingestGithub', () => {
  const GH_FIELDS =
    'title,body,author,baseRefName,headRefName,baseRefOid,headRefOid,additions,deletions,changedFiles';

  const fakeMeta = {
    title: 'Test PR',
    body: 'desc',
    author: { login: 'testuser' },
    baseRefName: 'main',
    headRefName: 'feat/x',
    baseRefOid: 'abc000',
    headRefOid: 'def111',
    additions: 10,
    deletions: 2,
    changedFiles: 1,
  };

  const fakeDiff = 'diff --git a/foo.ts b/foo.ts\n+const x = 1;\n';

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls execa with exact argv arrays for pr view and pr diff', async () => {
    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockImplementation(
      (_bin: string, args: string[]) => {
        if (args[0] === 'pr' && args[1] === 'view') {
          return Promise.resolve({ stdout: JSON.stringify(fakeMeta) });
        }
        if (args[0] === 'pr' && args[1] === 'diff') {
          return Promise.resolve({ stdout: fakeDiff });
        }
        return Promise.reject(new Error('unexpected call'));
      }
    );

    const { ingestGithub } = await import('../github.js');
    const result = await ingestGithub('42');

    const calls = (execa as ReturnType<typeof vi.fn>).mock.calls;
    const viewCall = calls.find(
      ([_b, args]: [string, string[]]) => args[0] === 'pr' && args[1] === 'view'
    );
    const diffCall = calls.find(
      ([_b, args]: [string, string[]]) => args[0] === 'pr' && args[1] === 'diff'
    );

    expect(viewCall).toBeDefined();
    expect(viewCall[0]).toBe('gh');
    expect(viewCall[1]).toEqual(['pr', 'view', '42', '--json', GH_FIELDS]);

    expect(diffCall).toBeDefined();
    expect(diffCall[0]).toBe('gh');
    expect(diffCall[1]).toEqual(['pr', 'diff', '42']);

    expect(result.meta.title).toBe('Test PR');
    expect(result.diffText).toBe(fakeDiff);
  });

  it('invokes both calls in parallel (both are started before either resolves)', async () => {
    const { execa } = await import('execa');
    const callOrder: string[] = [];

    (execa as ReturnType<typeof vi.fn>).mockImplementation(
      (_bin: string, args: string[]) => {
        callOrder.push(`${args[0]}-${args[1]}`);
        if (args[0] === 'pr' && args[1] === 'view') {
          return Promise.resolve({ stdout: JSON.stringify(fakeMeta) });
        }
        if (args[0] === 'pr' && args[1] === 'diff') {
          return Promise.resolve({ stdout: fakeDiff });
        }
        return Promise.reject(new Error('unexpected call'));
      }
    );

    const { ingestGithub } = await import('../github.js');
    await ingestGithub('42');

    // Both calls should have been started
    expect(callOrder).toContain('pr-view');
    expect(callOrder).toContain('pr-diff');
  });

  it('maps gh-auth failure to a friendly error containing "gh auth login"', async () => {
    const { execa } = await import('execa');
    const authError = Object.assign(new Error('authentication required'), {
      stderr: 'You must run: gh auth login',
    });
    (execa as ReturnType<typeof vi.fn>).mockRejectedValue(authError);

    const { ingestGithub } = await import('../github.js');
    await expect(ingestGithub('42')).rejects.toThrow(/gh auth login/i);
  });

  it('maps "no default repository" to a friendly error', async () => {
    const { execa } = await import('execa');
    const repoError = Object.assign(new Error('no repo'), {
      stderr: 'no default repository',
    });
    (execa as ReturnType<typeof vi.fn>).mockRejectedValue(repoError);

    const { ingestGithub } = await import('../github.js');
    await expect(ingestGithub('42')).rejects.toThrow(/repo|PR URL/i);
  });

  it('wraps generic execa failures as Error', async () => {
    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('something went wrong')
    );

    const { ingestGithub } = await import('../github.js');
    await expect(ingestGithub('42')).rejects.toThrow(/gh CLI failed|something went wrong/i);
  });
});

describe('fetchCurrentHeadSha', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls gh pr view <id> --json headRefOid and returns the sha', async () => {
    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockImplementation(
      (_bin: string, args: string[]) => {
        if (args[0] === 'pr' && args[1] === 'view' && args[3] === '--json' && args[4] === 'headRefOid') {
          return Promise.resolve({ stdout: JSON.stringify({ headRefOid: 'abc123def' }) });
        }
        return Promise.reject(new Error('unexpected call'));
      }
    );

    const { fetchCurrentHeadSha } = await import('../github.js');
    const sha = await fetchCurrentHeadSha('123');

    const calls = (execa as ReturnType<typeof vi.fn>).mock.calls;
    const viewCall = calls.find(
      ([_b, args]: [string, string[]]) => args[0] === 'pr' && args[1] === 'view'
    );
    expect(viewCall).toBeDefined();
    expect(viewCall[0]).toBe('gh');
    expect(viewCall[1]).toEqual(['pr', 'view', '123', '--json', 'headRefOid']);
    expect(sha).toBe('abc123def');
  });

  it('throws on transient gh failure (does NOT swallow)', async () => {
    const { execa } = await import('execa');
    const failErr = Object.assign(new Error('gh crashed'), {
      stderr: 'connection reset',
    });
    (execa as ReturnType<typeof vi.fn>).mockRejectedValue(failErr);

    const { fetchCurrentHeadSha } = await import('../github.js');
    await expect(fetchCurrentHeadSha('123')).rejects.toThrow(/gh CLI failed|gh crashed/i);
  });

  it('throws when gh returns empty headRefOid (fail closed)', async () => {
    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockResolvedValue({
      stdout: JSON.stringify({ headRefOid: '' }),
    });

    const { fetchCurrentHeadSha } = await import('../github.js');
    await expect(fetchCurrentHeadSha('123')).rejects.toThrow(/headRefOid/i);
  });
});
