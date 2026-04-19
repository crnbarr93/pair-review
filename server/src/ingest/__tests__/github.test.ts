import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('execa', () => ({ execa: vi.fn() }));

describe('ingestGithub', () => {
  const GH_FIELDS =
    'title,body,author,baseRefName,headRefName,headRefOid,additions,deletions,changedFiles,number';

  // `gh pr view --json` response — note: baseRefOid is NOT here; gh doesn't expose it.
  const fakePrView = {
    title: 'Test PR',
    body: 'desc',
    author: { login: 'testuser' },
    baseRefName: 'main',
    headRefName: 'feat/x',
    headRefOid: 'def111',
    additions: 10,
    deletions: 2,
    changedFiles: 1,
    number: 42,
  };

  const BASE_SHA = 'abc0000000000000000000000000000000000000';
  const fakeDiff = 'diff --git a/foo.ts b/foo.ts\n+const x = 1;\n';

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeExecaMock(opts: {
    repoView?: { owner: string; name: string };
    baseSha?: string;
  } = {}) {
    return (_bin: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return Promise.resolve({ stdout: JSON.stringify(fakePrView) });
      }
      if (args[0] === 'pr' && args[1] === 'diff') {
        return Promise.resolve({ stdout: fakeDiff });
      }
      if (args[0] === 'repo' && args[1] === 'view') {
        const rv = opts.repoView ?? { owner: 'acme', name: 'widgets' };
        return Promise.resolve({
          stdout: JSON.stringify({ owner: { login: rv.owner }, name: rv.name }),
        });
      }
      if (args[0] === 'api') {
        return Promise.resolve({ stdout: (opts.baseSha ?? BASE_SHA) + '\n' });
      }
      return Promise.reject(new Error(`unexpected call: ${args.join(' ')}`));
    };
  }

  it('fetches pr view + pr diff + base SHA via gh api, merges into GitHubPrViewJson', async () => {
    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockImplementation(makeExecaMock());

    const { ingestGithub } = await import('../github.js');
    const result = await ingestGithub('42');

    const calls = (execa as ReturnType<typeof vi.fn>).mock.calls;
    const viewCall = calls.find(
      ([_b, args]: [string, string[]]) => args[0] === 'pr' && args[1] === 'view'
    );
    const diffCall = calls.find(
      ([_b, args]: [string, string[]]) => args[0] === 'pr' && args[1] === 'diff'
    );
    const apiCall = calls.find(([_b, args]: [string, string[]]) => args[0] === 'api');

    expect(viewCall[1]).toEqual(['pr', 'view', '42', '--json', GH_FIELDS]);
    expect(diffCall[1]).toEqual(['pr', 'diff', '42']);
    expect(apiCall[1]).toEqual([
      'api',
      'repos/acme/widgets/pulls/42',
      '--jq',
      '.base.sha',
    ]);

    expect(result.meta.title).toBe('Test PR');
    expect(result.meta.baseRefOid).toBe(BASE_SHA);
    expect(result.meta.headRefOid).toBe('def111');
    expect(result.diffText).toBe(fakeDiff);
  });

  it('parses owner/repo from a full PR URL (skips gh repo view)', async () => {
    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockImplementation(makeExecaMock());

    const { ingestGithub } = await import('../github.js');
    await ingestGithub('https://github.com/alice/proj/pull/42');

    const calls = (execa as ReturnType<typeof vi.fn>).mock.calls;
    const apiCall = calls.find(([_b, args]: [string, string[]]) => args[0] === 'api');
    const repoViewCall = calls.find(
      ([_b, args]: [string, string[]]) => args[0] === 'repo' && args[1] === 'view'
    );

    expect(repoViewCall).toBeUndefined();
    expect(apiCall[1]).toEqual([
      'api',
      'repos/alice/proj/pulls/42',
      '--jq',
      '.base.sha',
    ]);
  });

  it('throws when gh api returns a non-SHA-40 value (fail closed)', async () => {
    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockImplementation(
      makeExecaMock({ baseSha: 'not-a-sha' })
    );

    const { ingestGithub } = await import('../github.js');
    await expect(ingestGithub('42')).rejects.toThrow(/invalid base\.sha/i);
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
