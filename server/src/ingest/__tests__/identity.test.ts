import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('execa', () => ({ execa: vi.fn() }));

describe('fetchAuthIdentity', () => {
  beforeEach(() => {
    vi.resetModules();
    // Ensure GITHUB_TOKEN is clean unless set per-test
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  it('returns AuthIdentity with login and avatarUrl on success', async () => {
    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockResolvedValue({
      stdout: JSON.stringify({ login: 'testuser', avatar_url: 'https://avatars.githubusercontent.com/u/1' }),
    });

    const { fetchAuthIdentity } = await import('../identity.js');
    const result = await fetchAuthIdentity();

    expect(result).toEqual({
      login: 'testuser',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1',
      mismatch: false,
    });
  });

  it('returns null when gh api fails (fail-open per D-04)', async () => {
    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));

    const { fetchAuthIdentity } = await import('../identity.js');
    const result = await fetchAuthIdentity();

    expect(result).toBeNull();
  });

  it('returns null when gh api returns invalid JSON', async () => {
    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockResolvedValue({ stdout: 'not json' });

    const { fetchAuthIdentity } = await import('../identity.js');
    const result = await fetchAuthIdentity();

    expect(result).toBeNull();
  });

  it('sets mismatch=true when GITHUB_TOKEN resolves to a different user', async () => {
    process.env.GITHUB_TOKEN = 'fake-token';

    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockImplementation(
      (_bin: string, _args: string[], opts?: { env?: Record<string, string> }) => {
        if (opts?.env?.GH_TOKEN) {
          // Second call: GITHUB_TOKEN user — different user
          return Promise.resolve({ stdout: JSON.stringify({ login: 'user-b' }) });
        }
        // First call: gh auth user
        return Promise.resolve({
          stdout: JSON.stringify({ login: 'user-a', avatar_url: 'https://avatars.githubusercontent.com/u/1' }),
        });
      }
    );

    const { fetchAuthIdentity } = await import('../identity.js');
    const result = await fetchAuthIdentity();

    expect(result).not.toBeNull();
    expect(result!.mismatch).toBe(true);
  });

  it('sets mismatch=false when GITHUB_TOKEN resolves to same user', async () => {
    process.env.GITHUB_TOKEN = 'fake-token';

    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockImplementation(
      (_bin: string, _args: string[], opts?: { env?: Record<string, string> }) => {
        if (opts?.env?.GH_TOKEN) {
          // Second call: GITHUB_TOKEN user — same user
          return Promise.resolve({ stdout: JSON.stringify({ login: 'user-a' }) });
        }
        // First call: gh auth user
        return Promise.resolve({
          stdout: JSON.stringify({ login: 'user-a', avatar_url: 'https://avatars.githubusercontent.com/u/1' }),
        });
      }
    );

    const { fetchAuthIdentity } = await import('../identity.js');
    const result = await fetchAuthIdentity();

    expect(result).not.toBeNull();
    expect(result!.mismatch).toBe(false);
  });

  it('mismatch detection failure is itself fail-open (returns false, not null)', async () => {
    process.env.GITHUB_TOKEN = 'fake-token';

    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockImplementation(
      (_bin: string, _args: string[], opts?: { env?: Record<string, string> }) => {
        if (opts?.env?.GH_TOKEN) {
          // Second call: mismatch detection fails
          return Promise.reject(new Error('mismatch check failed'));
        }
        // First call: succeeds
        return Promise.resolve({
          stdout: JSON.stringify({ login: 'user-a', avatar_url: 'https://avatars.githubusercontent.com/u/1' }),
        });
      }
    );

    const { fetchAuthIdentity } = await import('../identity.js');
    const result = await fetchAuthIdentity();

    expect(result).not.toBeNull();
    expect(result!.mismatch).toBe(false);
  });

  it('skips mismatch detection when GITHUB_TOKEN is not set', async () => {
    // GITHUB_TOKEN already deleted in beforeEach

    const { execa } = await import('execa');
    (execa as ReturnType<typeof vi.fn>).mockResolvedValue({
      stdout: JSON.stringify({ login: 'testuser', avatar_url: 'https://avatars.githubusercontent.com/u/1' }),
    });

    const { fetchAuthIdentity } = await import('../identity.js');
    const result = await fetchAuthIdentity();

    expect(result).not.toBeNull();
    expect(result!.mismatch).toBe(false);
    expect((execa as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});
