import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test bootstrap() in isolation.
// main.tsx auto-runs bootstrap() unless window.__TEST__ is set.
// We set __TEST__ = true BEFORE importing main.tsx so the auto-run guard fires.

describe('main.tsx bootstrap', () => {
  let originalSearch: string;
  let originalLocation: Location;

  beforeEach(() => {
    // Suppress React rendering errors in happy-dom
    vi.stubGlobal('__TEST__', true);

    // Capture original location
    originalSearch = window.location.search;
    originalLocation = window.location;

    // Reset mocks
    vi.restoreAllMocks();

    // Re-stub __TEST__ after restoreAllMocks
    vi.stubGlobal('__TEST__', true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('calls fetch /api/session/adopt with the token from the URL query', async () => {
    // Arrange: set up location.search with token + session
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?token=abc123&session=gh:o%2Fr%231' },
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    const replaceStateMock = vi.spyOn(history, 'replaceState').mockImplementation(() => {});

    // Import bootstrap after stubs are in place
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

    const fetchMock = vi.fn().mockImplementation(async () => {
      callOrder.push('fetch');
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const replaceStateMock = vi.spyOn(history, 'replaceState').mockImplementation(() => {
      callOrder.push('replaceState');
    });

    // EventSource is already mocked globally by setup.ts (MockEventSource)
    // Spy on the constructor
    const OriginalEventSource = globalThis.EventSource;
    const esConstructorSpy = vi.fn().mockImplementation((...args: ConstructorParameters<typeof EventSource>) => {
      callOrder.push('EventSource');
      return new OriginalEventSource(...args);
    });
    vi.stubGlobal('EventSource', esConstructorSpy);

    const { bootstrap } = await import('../main');
    await bootstrap();

    // Ordering: fetch → replaceState → EventSource
    const fetchIdx = callOrder.indexOf('fetch');
    const replaceIdx = callOrder.indexOf('replaceState');
    const esIdx = callOrder.indexOf('EventSource');

    expect(fetchIdx).toBeGreaterThanOrEqual(0);
    expect(replaceIdx).toBeGreaterThanOrEqual(0);
    expect(esIdx).toBeGreaterThanOrEqual(0);

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

    const esInstances: { url: string }[] = [];
    const OriginalEventSource = globalThis.EventSource;
    vi.stubGlobal(
      'EventSource',
      vi.fn().mockImplementation((url: string, opts?: EventSourceInit) => {
        esInstances.push({ url });
        return new OriginalEventSource(url, opts);
      })
    );

    const { bootstrap } = await import('../main');
    await bootstrap();

    expect(esInstances.length).toBeGreaterThan(0);
    // The session key should be encoded in the URL
    expect(esInstances[0].url).toContain('/api/events');
    expect(esInstances[0].url).toContain('session=');
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
    const OriginalEventSource = globalThis.EventSource;
    vi.stubGlobal(
      'EventSource',
      vi.fn().mockImplementation((url: string, opts?: EventSourceInit) => {
        esConstructed = true;
        return new OriginalEventSource(url, opts);
      })
    );

    const { bootstrap } = await import('../main');
    await bootstrap();

    expect(esConstructed).toBe(false);
  });

  it('renders a fatal message in #root when fetch returns non-OK', async () => {
    // Create root element if not present
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
