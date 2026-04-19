import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// main.tsx auto-runs bootstrap() unless window.__TEST__ is set.
// We set __TEST__ = true BEFORE importing main.tsx so the auto-run guard does not fire.

describe('main.tsx bootstrap', () => {
  beforeEach(() => {
    vi.stubGlobal('__TEST__', true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('calls fetch /api/session/adopt with the token from the URL query', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?token=abc123&session=gh:o%2Fr%231' },
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(history, 'replaceState').mockImplementation(() => {});

    const { bootstrap } = await import('../main');
    await bootstrap();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session/adopt',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'abc123' }),
      })
    );
  });

  it('calls history.replaceState AFTER fetch resolves and BEFORE EventSource construction', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?token=tok&session=gh:o%2Fr%231' },
    });

    const callOrder: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        callOrder.push('fetch');
        return { ok: true };
      })
    );

    vi.spyOn(history, 'replaceState').mockImplementation(() => {
      callOrder.push('replaceState');
    });

    // Build a class-based EventSource mock that records construction order
    const MockES = class {
      url: string;
      onerror: ((ev: Event) => void) | null = null;
      constructor(url: string) {
        this.url = url;
        callOrder.push('EventSource');
      }
      addEventListener() {}
      close() {}
    };
    vi.stubGlobal('EventSource', MockES);

    const { bootstrap } = await import('../main');
    await bootstrap();

    const fetchIdx = callOrder.indexOf('fetch');
    const replaceIdx = callOrder.indexOf('replaceState');
    const esIdx = callOrder.indexOf('EventSource');

    expect(fetchIdx).toBeGreaterThanOrEqual(0);
    expect(replaceIdx).toBeGreaterThanOrEqual(0);
    expect(esIdx).toBeGreaterThanOrEqual(0);

    // Critical ordering assertion: fetch → replaceState → EventSource (T-03 mitigation)
    expect(replaceIdx).toBeGreaterThan(fetchIdx);
    expect(esIdx).toBeGreaterThan(replaceIdx);
  });

  it('opens EventSource at /api/events?session=<sessionKey>', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?token=tok&session=gh:o%2Fr%231' },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(history, 'replaceState').mockImplementation(() => {});

    const esUrls: string[] = [];
    const MockES = class {
      url: string;
      onerror: ((ev: Event) => void) | null = null;
      constructor(url: string) {
        this.url = url;
        esUrls.push(url);
      }
      addEventListener() {}
      close() {}
    };
    vi.stubGlobal('EventSource', MockES);

    const { bootstrap } = await import('../main');
    await bootstrap();

    expect(esUrls.length).toBeGreaterThan(0);
    expect(esUrls[0]).toContain('/api/events');
    expect(esUrls[0]).toContain('session=');
  });

  it('does NOT call history.replaceState when fetch returns non-OK', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?token=badtok&session=gh:o%2Fr%231' },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const replaceStateMock = vi.spyOn(history, 'replaceState').mockImplementation(() => {});

    const { bootstrap } = await import('../main');
    await bootstrap();

    expect(replaceStateMock).not.toHaveBeenCalled();
  });

  it('does NOT open EventSource when fetch returns non-OK', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?token=badtok&session=gh:o%2Fr%231' },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    vi.spyOn(history, 'replaceState').mockImplementation(() => {});

    let esConstructed = false;
    const MockES = class {
      url: string;
      onerror: ((ev: Event) => void) | null = null;
      constructor(url: string) {
        this.url = url;
        esConstructed = true;
      }
      addEventListener() {}
      close() {}
    };
    vi.stubGlobal('EventSource', MockES);

    const { bootstrap } = await import('../main');
    await bootstrap();

    expect(esConstructed).toBe(false);
  });

  it('calls setReviewToken + setSource BEFORE history.replaceState (token capture ordering)', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?token=abc&session=gh:o/r%231' },
    });

    const callOrder: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        callOrder.push('fetch');
        return { ok: true };
      })
    );
    vi.spyOn(history, 'replaceState').mockImplementation(() => {
      callOrder.push('replaceState');
    });

    const MockES = class {
      url: string;
      onerror: ((ev: Event) => void) | null = null;
      constructor(url: string) {
        this.url = url;
      }
      addEventListener() {}
      close() {}
    };
    vi.stubGlobal('EventSource', MockES);

    // Mock the api module so we can verify setReviewToken + setSource are
    // called in the right order. Also keep adoptSession resolving truthy.
    vi.doMock('../api', () => ({
      adoptSession: vi.fn().mockImplementation(async () => {
        callOrder.push('adoptSession');
        return true;
      }),
      openEventStream: vi.fn(),
      setReviewToken: vi.fn().mockImplementation((tok: string) => {
        callOrder.push(`setReviewToken:${tok}`);
      }),
    }));
    vi.doMock('../store', () => ({
      actions: {
        onAdoptFailed: vi.fn(),
        onSnapshot: vi.fn(),
        onUpdate: vi.fn(),
        onSessionExpired: vi.fn(),
        setSource: vi.fn().mockImplementation((src: unknown) => {
          callOrder.push(`setSource:${JSON.stringify(src)}`);
        }),
      },
    }));

    const { bootstrap } = await import('../main');
    await bootstrap();

    const setTokenIdx = callOrder.findIndex((c) => c.startsWith('setReviewToken:'));
    const setSourceIdx = callOrder.findIndex((c) => c.startsWith('setSource:'));
    const replaceIdx = callOrder.indexOf('replaceState');

    expect(setTokenIdx).toBeGreaterThanOrEqual(0);
    expect(setSourceIdx).toBeGreaterThanOrEqual(0);
    expect(replaceIdx).toBeGreaterThanOrEqual(0);

    // Critical: capture BEFORE wipe.
    expect(setTokenIdx).toBeLessThan(replaceIdx);
    expect(setSourceIdx).toBeLessThan(replaceIdx);

    // setReviewToken called with the token from the URL.
    expect(callOrder[setTokenIdx]).toBe('setReviewToken:abc');
    // setSource called with the github-shaped source derived from the prKey.
    expect(callOrder[setSourceIdx]).toBe('setSource:{"kind":"github","number":1}');

    vi.doUnmock('../api');
    vi.doUnmock('../store');
  });

  it('renders a fatal message in #root when fetch returns non-OK', async () => {
    let root = document.getElementById('root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'root';
      document.body.appendChild(root);
    }
    root.textContent = '';

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?token=badtok&session=gh:o%2Fr%231' },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    vi.spyOn(history, 'replaceState').mockImplementation(() => {});

    const { bootstrap } = await import('../main');
    await bootstrap();

    expect(root.textContent).not.toBe('');
  });
});
