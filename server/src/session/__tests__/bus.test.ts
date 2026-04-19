import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReviewSession, SessionEvent } from '@shared/types';

// Mock logger so we can assert warn-on-listener-throw
vi.mock('../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const makeSession = (): ReviewSession => ({
  prKey: 'gh:o/r#1',
  pr: {
    source: 'github',
    title: 'Test PR',
    description: 'test',
    author: 'user',
    baseBranch: 'main',
    headBranch: 'feat',
    baseSha: 'base000',
    headSha: 'abc123',
    additions: 0,
    deletions: 0,
    filesChanged: 0,
  },
  diff: { files: [], totalHunks: 0 },
  shikiTokens: {},
  createdAt: '2026-04-19T00:00:00.000Z',
  headSha: 'abc123',
  error: null,
  lastEventId: 0,
});

const makeEvent = (): SessionEvent => ({ type: 'session.reset' });

describe('SessionBus', () => {
  let SessionBus: typeof import('../bus.js').SessionBus;
  let warnMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../bus.js');
    SessionBus = mod.SessionBus;
    const loggerMod = await import('../../logger.js');
    warnMock = vi.mocked(loggerMod.logger.warn);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('on() registers a listener that fires on emit() with the exact payload', () => {
    const bus = new SessionBus();
    const listener = vi.fn();
    bus.on('session:updated', listener);

    const payload = { id: 'gh:o/r#1', event: makeEvent(), state: makeSession() };
    bus.emit('session:updated', payload);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(payload);
  });

  it('payload shape carries id, event, and state keys', () => {
    const bus = new SessionBus();
    const listener = vi.fn();
    bus.on('session:updated', listener);

    bus.emit('session:updated', {
      id: 'prkey-x',
      event: { type: 'session.reset' },
      state: makeSession(),
    });

    const call = listener.mock.calls[0][0];
    expect(call).toHaveProperty('id');
    expect(call).toHaveProperty('event');
    expect(call).toHaveProperty('state');
  });

  it('off() removes the listener — subsequent emits do not call it', () => {
    const bus = new SessionBus();
    const listener = vi.fn();
    bus.on('session:updated', listener);

    const payload = { id: 'k', event: makeEvent(), state: makeSession() };
    bus.emit('session:updated', payload);
    expect(listener).toHaveBeenCalledTimes(1);

    bus.off('session:updated', listener);
    bus.emit('session:updated', payload);
    expect(listener).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it('multiple listeners fire in registration order', () => {
    const bus = new SessionBus();
    const order: string[] = [];
    const a = () => order.push('a');
    const b = () => order.push('b');
    const c = () => order.push('c');

    bus.on('session:updated', a);
    bus.on('session:updated', b);
    bus.on('session:updated', c);

    bus.emit('session:updated', { id: 'k', event: makeEvent(), state: makeSession() });

    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('listener throw does not crash emitter — other listeners still fire + logger.warn called', () => {
    const bus = new SessionBus();
    const firstCalled = vi.fn(() => {
      throw new Error('boom');
    });
    const secondCalled = vi.fn();

    bus.on('session:updated', firstCalled);
    bus.on('session:updated', secondCalled);

    // Must not throw
    expect(() => {
      bus.emit('session:updated', { id: 'k', event: makeEvent(), state: makeSession() });
    }).not.toThrow();

    expect(firstCalled).toHaveBeenCalledTimes(1);
    expect(secondCalled).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalled();
  });
});
