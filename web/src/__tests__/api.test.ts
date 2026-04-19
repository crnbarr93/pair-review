import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for web/src/api.ts (Plan 02-04 Task 1):
 *  - openEventStream registers both 'snapshot' AND 'update' listeners
 *  - chooseResume POSTs with X-Review-Token header + JSON body
 *  - setReviewToken captures the token; chooseResume throws when unset
 */

// A stub EventSource shape that records addEventListener calls and exposes
// a `dispatch(type, data)` helper so tests can simulate named server events.
class StubEventSource {
  public url: string;
  public options: unknown;
  public onerror: ((ev: Event) => void) | null = null;
  private listeners = new Map<string, (ev: MessageEvent) => void>();

  constructor(url: string, options?: unknown) {
    this.url = url;
    this.options = options;
  }

  addEventListener(type: string, handler: EventListenerOrEventListenerObject) {
    this.listeners.set(type, handler as (ev: MessageEvent) => void);
  }

  close() {}

  // Test helper
  dispatch(type: string, data: string) {
    const ev = new MessageEvent(type, { data });
    const h = this.listeners.get(type);
    if (h) h(ev);
  }
}

// Shared reference so tests can grab the most recent instance.
let lastInstance: StubEventSource | null = null;

function installStubEventSource() {
  const ctor = function (this: StubEventSource, url: string, options?: unknown) {
    const inst = new StubEventSource(url, options);
    lastInstance = inst;
    return inst;
  } as unknown as typeof EventSource;
  vi.stubGlobal('EventSource', ctor);
}

describe('openEventStream', () => {
  beforeEach(() => {
    lastInstance = null;
    installStubEventSource();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("registers an 'update' listener and forwards parsed UpdateMessage payloads", async () => {
    const { openEventStream } = await import('../api');

    const onSnapshot = vi.fn();
    const onUpdate = vi.fn();
    const onError = vi.fn();

    openEventStream('gh:o/r#1', onSnapshot, onUpdate, onError);
    expect(lastInstance).toBeTruthy();

    const payload = {
      type: 'update',
      event: { type: 'session.viewBoth' },
      state: { prKey: 'gh:o/r#1', lastEventId: 2 },
    };
    lastInstance!.dispatch('update', JSON.stringify(payload));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ type: 'update' }));
  });

  it("still forwards 'snapshot' events to onSnapshot (regression check)", async () => {
    const { openEventStream } = await import('../api');

    const onSnapshot = vi.fn();
    const onUpdate = vi.fn();
    const onError = vi.fn();

    openEventStream('gh:o/r#1', onSnapshot, onUpdate, onError);
    const payload = {
      type: 'snapshot',
      session: { prKey: 'gh:o/r#1', lastEventId: 0 },
      launchUrl: 'http://127.0.0.1:1/',
      tokenLast4: 'abcd',
    };
    lastInstance!.dispatch('snapshot', JSON.stringify(payload));

    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ type: 'snapshot' }));
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('chooseResume', () => {
  beforeEach(() => {
    // Each test gets a fresh module graph so reviewToken is reset.
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs with Content-Type + X-Review-Token and the JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const { setReviewToken, chooseResume } = await import('../api');
    setReviewToken('abc123');

    const params = {
      prKey: 'gh:o/r#1',
      choice: 'adopt' as const,
      source: { kind: 'github' as const, number: 1 },
    };
    await chooseResume(params);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/session/choose-resume');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Review-Token': 'abc123',
    });
    expect(JSON.parse(init.body as string)).toEqual(params);
  });

  it('returns { ok: true } on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const { setReviewToken, chooseResume } = await import('../api');
    setReviewToken('tok');

    const result = await chooseResume({
      prKey: 'gh:o/r#1',
      choice: 'reset',
      source: { kind: 'github', number: 1 },
    });
    expect(result).toEqual({ ok: true });
  });

  it('throws on non-200 with a message containing "HTTP 500"', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    const { setReviewToken, chooseResume } = await import('../api');
    setReviewToken('tok');

    await expect(
      chooseResume({
        prKey: 'gh:o/r#1',
        choice: 'viewBoth',
        source: { kind: 'github', number: 1 },
      })
    ).rejects.toThrowError(/HTTP 500/);
  });

  it('throws when setReviewToken has not been called', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { chooseResume } = await import('../api');

    await expect(
      chooseResume({
        prKey: 'gh:o/r#1',
        choice: 'adopt',
        source: { kind: 'github', number: 1 },
      })
    ).rejects.toThrowError(/review token not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('postSessionEvent', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when no review token is set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { postSessionEvent } = await import('../api');

    await expect(
      postSessionEvent('gh:o/r#1', {
        type: 'file.reviewStatusSet',
        fileId: 'f1',
        status: 'reviewed',
      })
    ).rejects.toThrowError(/review token not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs /api/session/events with X-Review-Token header and the JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const { setReviewToken, postSessionEvent } = await import('../api');
    setReviewToken('TOK');

    const event = {
      type: 'file.reviewStatusSet' as const,
      fileId: 'f1',
      status: 'reviewed' as const,
    };
    const res = await postSessionEvent('gh:o/r#1', event);

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/session/events');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Review-Token': 'TOK',
    });
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body as string)).toEqual({ prKey: 'gh:o/r#1', event });
  });

  it('throws on non-ok HTTP response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    vi.stubGlobal('fetch', fetchMock);

    const { setReviewToken, postSessionEvent } = await import('../api');
    setReviewToken('TOK');

    await expect(
      postSessionEvent('gh:o/r#1', {
        type: 'file.reviewStatusSet',
        fileId: 'f1',
        status: 'reviewed',
      })
    ).rejects.toThrowError(/403/);
  });
});
