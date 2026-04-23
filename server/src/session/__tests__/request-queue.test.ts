/**
 * Phase 06.1 request-queue tests — verifies SessionRequestQueue and RequestQueueManager
 * classes from server/src/session/request-queue.ts.
 *
 * TDD RED: These tests fail until request-queue.ts is created.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionRequestQueue, RequestQueueManager } from '../request-queue.js';
import type { QueuedRequest } from '../request-queue.js';

describe('SessionRequestQueue', () => {
  let queue: SessionRequestQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new SessionRequestQueue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('enqueue — resolver is waiting', () => {
    it('resolves a waiting Promise immediately when a request is enqueued', async () => {
      // Start waiting (no items in queue)
      const waitPromise = queue.waitForRequest(5000);

      // Enqueue while awaiting — should resolve immediately
      const req: QueuedRequest = { type: 'chat', payload: { message: 'hello' } };
      queue.enqueue(req);

      const result = await waitPromise;
      expect(result).toEqual(req);
    });

    it('clears the timeout when enqueuing into a waiting resolver', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      const waitPromise = queue.waitForRequest(5000);
      queue.enqueue({ type: 'run_self_review' });

      await waitPromise;
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('enqueue — no resolver waiting', () => {
    it('pushes to queue when no resolver is waiting', () => {
      const req: QueuedRequest = { type: 'chat', payload: { message: 'queued' } };
      queue.enqueue(req);
      expect(queue.pendingCount).toBe(1);
    });

    it('accumulates multiple requests in FIFO order', () => {
      queue.enqueue({ type: 'chat', payload: { message: 'first' } });
      queue.enqueue({ type: 'run_self_review' });
      queue.enqueue({ type: 'regenerate_summary' });
      expect(queue.pendingCount).toBe(3);
    });
  });

  describe('waitForRequest — queue non-empty', () => {
    it('returns queued item immediately if queue has items', async () => {
      const req: QueuedRequest = { type: 'run_self_review' };
      queue.enqueue(req);

      const result = await queue.waitForRequest(5000);
      expect(result).toEqual(req);
      expect(queue.pendingCount).toBe(0);
    });

    it('returns items in FIFO order', async () => {
      queue.enqueue({ type: 'chat', payload: { message: 'first' } });
      queue.enqueue({ type: 'run_self_review' });

      const r1 = await queue.waitForRequest(5000);
      const r2 = await queue.waitForRequest(5000);

      expect(r1?.type).toBe('chat');
      expect(r2?.type).toBe('run_self_review');
    });
  });

  describe('waitForRequest — timeout', () => {
    it('returns null on timeout', async () => {
      const waitPromise = queue.waitForRequest(3000);

      // Advance fake timers past the timeout
      vi.advanceTimersByTime(3001);

      const result = await waitPromise;
      expect(result).toBeNull();
    });

    it('returns null exactly at timeout boundary', async () => {
      const waitPromise = queue.waitForRequest(1000);
      vi.advanceTimersByTime(1000);
      const result = await waitPromise;
      expect(result).toBeNull();
    });
  });

  describe('waitForRequest — concurrent call guard', () => {
    it('throws if already waiting (concurrent call guard)', async () => {
      // Start first wait (will be pending)
      const _wait1 = queue.waitForRequest(5000);

      // Second call while first is pending should throw
      await expect(queue.waitForRequest(5000)).rejects.toThrow('already waiting');

      // Clean up first wait by resolving via enqueue
      queue.enqueue({ type: 'chat' });
      await _wait1;
    });
  });

  describe('pendingCount', () => {
    it('returns 0 for empty queue', () => {
      expect(queue.pendingCount).toBe(0);
    });

    it('returns correct count after enqueues', () => {
      queue.enqueue({ type: 'chat' });
      queue.enqueue({ type: 'run_self_review' });
      expect(queue.pendingCount).toBe(2);
    });

    it('decrements after dequeue via waitForRequest', async () => {
      queue.enqueue({ type: 'chat' });
      queue.enqueue({ type: 'regenerate_summary' });
      expect(queue.pendingCount).toBe(2);

      await queue.waitForRequest(100);
      expect(queue.pendingCount).toBe(1);
    });

    it('returns 0 when resolver is waiting (not items in queue)', async () => {
      // Start waiting — resolver pending, queue is empty
      const waitPromise = queue.waitForRequest(5000);
      expect(queue.pendingCount).toBe(0);

      // Resolve it so no leak
      queue.enqueue({ type: 'chat' });
      await waitPromise;
    });
  });

  describe('re-entry after timeout', () => {
    it('allows a second waitForRequest after timeout resolves', async () => {
      // First wait — times out
      const wait1 = queue.waitForRequest(500);
      vi.advanceTimersByTime(500);
      const result1 = await wait1;
      expect(result1).toBeNull();

      // Second wait — should work normally
      const wait2 = queue.waitForRequest(1000);
      queue.enqueue({ type: 'run_self_review' });
      const result2 = await wait2;
      expect(result2?.type).toBe('run_self_review');
    });
  });
});

describe('RequestQueueManager', () => {
  let manager: RequestQueueManager;

  beforeEach(() => {
    manager = new RequestQueueManager();
  });

  it('creates a new queue for a prKey', () => {
    const queue = manager.getQueue('gh:owner/repo#1');
    expect(queue).toBeInstanceOf(SessionRequestQueue);
  });

  it('reuses existing queue for the same prKey', () => {
    const queue1 = manager.getQueue('gh:owner/repo#1');
    const queue2 = manager.getQueue('gh:owner/repo#1');
    expect(queue1).toBe(queue2);
  });

  it('creates separate queues for different prKeys', () => {
    const queue1 = manager.getQueue('gh:owner/repo#1');
    const queue2 = manager.getQueue('gh:owner/repo#2');
    expect(queue1).not.toBe(queue2);
  });

  it('queues from different prKeys are independent', async () => {
    vi.useFakeTimers();

    const q1 = manager.getQueue('gh:owner/repo#1');
    const q2 = manager.getQueue('gh:owner/repo#2');

    q1.enqueue({ type: 'chat', payload: { message: 'from pr1' } });

    expect(q1.pendingCount).toBe(1);
    expect(q2.pendingCount).toBe(0);

    vi.useRealTimers();
  });
});
