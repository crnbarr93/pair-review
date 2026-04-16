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
