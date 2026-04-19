import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('execa', () => ({ execa: vi.fn() }));
vi.mock('../../logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { execa } from 'execa';
import { fetchCIChecks } from '../github.js';

describe('fetchCIChecks', () => {
  beforeEach(() => vi.mocked(execa).mockReset());

  it('uses the correct --json field names (bucket,link NOT conclusion,detailsUrl)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(execa).mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as any);
    await fetchCIChecks(42);
    const call = vi.mocked(execa).mock.calls[0];
    expect(call[0]).toBe('gh');
    expect(call[1]).toContain('pr');
    expect(call[1]).toContain('checks');
    expect(call[1]).toContain('42');
    const jsonIdx = (call[1] as string[]).indexOf('--json');
    expect(jsonIdx).toBeGreaterThan(-1);
    const fields = (call[1] as string[])[jsonIdx + 1];
    expect(fields).toMatch(/\bbucket\b/);
    expect(fields).toMatch(/\blink\b/);
    expect(fields).not.toMatch(/\bconclusion\b/);
    expect(fields).not.toMatch(/\bdetailsUrl\b/);
  });

  it('returns aggregate=none for empty checks', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(execa).mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as any);
    const r = await fetchCIChecks(1);
    expect(r.aggregate).toBe('none');
    expect(r.checks).toEqual([]);
  });

  it('returns aggregate=pass when all checks pass', async () => {
    vi.mocked(execa).mockResolvedValueOnce({
      stdout: JSON.stringify([
        { name: 'test', bucket: 'pass', link: 'https://x' },
        { name: 'lint', bucket: 'pass', link: 'https://y' },
      ]),
      exitCode: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const r = await fetchCIChecks(1);
    expect(r.aggregate).toBe('pass');
    expect(r.checks).toHaveLength(2);
  });

  it('returns aggregate=fail when any check fails', async () => {
    vi.mocked(execa).mockResolvedValueOnce({
      stdout: JSON.stringify([
        { name: 'test', bucket: 'pass', link: '' },
        { name: 'lint', bucket: 'fail', link: '' },
      ]),
      exitCode: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect((await fetchCIChecks(1)).aggregate).toBe('fail');
  });

  it('returns aggregate=pending when any check is pending and none fail', async () => {
    vi.mocked(execa).mockResolvedValueOnce({
      stdout: JSON.stringify([
        { name: 'test', bucket: 'pass', link: '' },
        { name: 'lint', bucket: 'pending', link: '' },
      ]),
      exitCode: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect((await fetchCIChecks(1)).aggregate).toBe('pending');
  });

  it('parses stdout on exit code 8 (checks pending — not an error per RESEARCH Pitfall B)', async () => {
    const err = Object.assign(new Error('gh exit 8'), {
      stdout: JSON.stringify([{ name: 'test', bucket: 'pending', link: '' }]),
      exitCode: 8,
    });
    vi.mocked(execa).mockRejectedValueOnce(err);
    const r = await fetchCIChecks(1);
    expect(r.aggregate).toBe('pending');
    expect(r.checks).toHaveLength(1);
  });

  it('throws on real gh failure (non-8 exit code)', async () => {
    const err = Object.assign(new Error('auth failed'), {
      stderr: 'gh auth login required',
      stdout: '',
      exitCode: 4,
    });
    vi.mocked(execa).mockRejectedValueOnce(err);
    await expect(fetchCIChecks(1)).rejects.toThrow();
  });
});
