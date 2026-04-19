import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('open', () => ({
  default: vi.fn(async () => undefined),
}));

describe('launchBrowser', () => {
  let callOrder: string[];
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let openMock: { default: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    callOrder = [];

    // Spy on stderr BEFORE importing so we can track call order
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((...args) => {
      callOrder.push('stderr:' + String(args[0]));
      return true;
    });

    // Get the mocked open module
    openMock = await import('open') as typeof openMock;

    // Reset open mock and track calls
    vi.mocked(openMock.default).mockImplementation(async (url) => {
      callOrder.push('open:' + url);
      return undefined as ReturnType<typeof import('open').default>;
    });

    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes URL to stderr BEFORE calling open()', async () => {
    const { launchBrowser } = await import('../browser-launch.js');

    const stderrWrites: string[] = [];
    const openCalls: string[] = [];
    const ordered: string[] = [];

    const stderrSpy2 = vi.spyOn(process.stderr, 'write').mockImplementation((...args) => {
      const msg = String(args[0]);
      stderrWrites.push(msg);
      ordered.push('stderr');
      return true;
    });

    const openMod2 = await import('open');
    vi.mocked(openMod2.default).mockImplementation(async (url) => {
      openCalls.push(String(url));
      ordered.push('open');
      return undefined as ReturnType<typeof import('open').default>;
    });

    await launchBrowser('http://127.0.0.1:12345/?token=abc');

    // stderr must come BEFORE open
    expect(ordered.indexOf('stderr')).toBeLessThan(ordered.indexOf('open'));
    expect(stderrWrites.some((w) => w.includes('http://127.0.0.1:12345'))).toBe(true);
    expect(openCalls[0]).toBe('http://127.0.0.1:12345/?token=abc');

    stderrSpy2.mockRestore();
  });

  it('does not throw when open() rejects, and stderr URL was already written', async () => {
    const { launchBrowser } = await import('../browser-launch.js');

    const stderrMessages: string[] = [];
    const ordered: string[] = [];

    vi.spyOn(process.stderr, 'write').mockImplementation((...args) => {
      stderrMessages.push(String(args[0]));
      ordered.push('stderr');
      return true;
    });

    const openMod2 = await import('open');
    vi.mocked(openMod2.default).mockImplementation(async () => {
      ordered.push('open');
      throw new Error('open failed');
    });

    // Must not throw
    await expect(launchBrowser('http://127.0.0.1:9999/?token=xyz')).resolves.toBeUndefined();

    // stderr came before open
    expect(ordered.indexOf('stderr')).toBeLessThan(ordered.indexOf('open'));
    // URL was printed to stderr before the failure
    expect(stderrMessages.some((m) => m.includes('http://127.0.0.1:9999'))).toBe(true);
  });

  it('skips open() when GIT_REVIEW_NO_BROWSER=1 but still prints the URL to stderr', async () => {
    const prev = process.env.GIT_REVIEW_NO_BROWSER;
    process.env.GIT_REVIEW_NO_BROWSER = '1';
    try {
      const { launchBrowser } = await import('../browser-launch.js');
      const stderrMessages: string[] = [];
      vi.spyOn(process.stderr, 'write').mockImplementation((...args) => {
        stderrMessages.push(String(args[0]));
        return true;
      });
      const openMod2 = await import('open');
      const openSpy = vi.mocked(openMod2.default);
      openSpy.mockClear();

      await expect(launchBrowser('http://127.0.0.1:7777/?token=skip')).resolves.toBeUndefined();

      expect(openSpy).not.toHaveBeenCalled();
      expect(stderrMessages.some((m) => m.includes('http://127.0.0.1:7777'))).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.GIT_REVIEW_NO_BROWSER;
      else process.env.GIT_REVIEW_NO_BROWSER = prev;
    }
  });
});
