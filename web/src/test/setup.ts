import '@testing-library/jest-dom/vitest';

// happy-dom doesn't ship EventSource — provide a minimal mock for tests
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readyState = MockEventSource.OPEN;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onopen: ((ev: Event) => void) | null = null;

  private listeners: Map<string, Array<(ev: MessageEvent | Event) => void>> = new Map();

  constructor(public url: string, public options?: { withCredentials?: boolean }) {}

  addEventListener(type: string, handler: (ev: MessageEvent | Event) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(handler);
  }

  removeEventListener(type: string, handler: (ev: MessageEvent | Event) => void) {
    const handlers = this.listeners.get(type);
    if (handlers) {
      this.listeners.set(type, handlers.filter((h) => h !== handler));
    }
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  /** Test helper: emit a named event with a JSON data payload */
  __emit(type: string, dataJson: string) {
    const ev = new MessageEvent(type, { data: dataJson });
    const handlers = this.listeners.get(type) ?? [];
    for (const h of handlers) h(ev);
    if (type === 'message' && this.onmessage) this.onmessage(ev);
    if (type === 'error' && this.onerror) this.onerror(ev);
  }
}

globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

// Phase 3 additions — IntersectionObserver + scrollIntoView (happy-dom does ship these
// but with behavior that fires callbacks unpredictably in tests. We replace with
// deterministic test-driven implementations.)

interface IntersectionObserverCallback {
  (
    entries: Array<{ target: Element; isIntersecting: boolean }>,
    observer: MockIntersectionObserver
  ): void;
}

class MockIntersectionObserver {
  private targets: Set<Element> = new Set();
  private callback: IntersectionObserverCallback;

  constructor(
    callback: IntersectionObserverCallback,
    _options?: { threshold?: number | number[] }
  ) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }

  /** Test helper: invoke the callback with a synthetic entry for a target */
  __trigger(target: Element, isIntersecting: boolean) {
    if (!this.targets.has(target)) return;
    this.callback([{ target, isIntersecting }], this);
  }

  /** Test helper: list currently-observed targets (for assertions) */
  __observed(): Element[] {
    return Array.from(this.targets);
  }
}

// Track all constructed observers so tests can reach into them via a helper
const __intersectionObservers: MockIntersectionObserver[] = [];
class TrackedMockIntersectionObserver extends MockIntersectionObserver {
  constructor(cb: IntersectionObserverCallback, options?: { threshold?: number | number[] }) {
    super(cb, options);
    __intersectionObservers.push(this);
  }
}

globalThis.IntersectionObserver =
  TrackedMockIntersectionObserver as unknown as typeof IntersectionObserver;

// Test helper accessor — tests can read last observer via globalThis.__lastIntersectionObserver()
(globalThis as Record<string, unknown>).__lastIntersectionObserver = () =>
  __intersectionObservers[__intersectionObservers.length - 1];
(globalThis as Record<string, unknown>).__allIntersectionObservers = () => __intersectionObservers;

// scrollIntoView — happy-dom doesn't implement it; stub to a no-op that records calls
if (
  typeof (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView !==
  'function'
) {
  (
    Element.prototype as unknown as { scrollIntoView: (options?: unknown) => void }
  ).scrollIntoView = function () {
    /* no-op in tests */
  };
}
