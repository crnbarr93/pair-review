/**
 * Phase 06.1: In-memory request queue for the UI → LLM reverse channel (D-04, D-05).
 *
 * SessionRequestQueue: per-session FIFO queue with a Promise-based resolver.
 * When `await_user_request` MCP tool calls `waitForRequest`, it blocks until
 * the browser POSTs to `/api/user-request` and `enqueue` is called.
 *
 * Key invariants:
 * - `enqueue` clears `this.resolver = null` BEFORE calling resolve() — prevents double-resolve.
 * - `waitForRequest` throws if called concurrently (concurrent call guard).
 * - On timeout, resolves with `null` — tool handler maps null to `{ type: 'no_request' }`.
 * - Module does NOT call applyEvent — HTTP route and MCP handlers own that.
 */

export interface QueuedRequest {
  type: 'chat' | 'inline_comment' | 'run_self_review' | 'regenerate_summary' | 'regenerate_walkthrough';
  payload?: Record<string, unknown>;
}

export class SessionRequestQueue {
  private queue: QueuedRequest[] = [];
  private resolver: ((req: QueuedRequest | null) => void) | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Called by POST /api/user-request.
   * If `await_user_request` tool is waiting, delivers immediately.
   * Otherwise pushes to FIFO queue for next `waitForRequest` call.
   */
  enqueue(req: QueuedRequest): void {
    if (this.resolver !== null) {
      const resolve = this.resolver;
      this.resolver = null;          // clear BEFORE calling resolve (prevents double-resolve race)
      if (this.timeout !== null) {
        clearTimeout(this.timeout);
        this.timeout = null;
      }
      resolve(req);
    } else {
      this.queue.push(req);
    }
  }

  /**
   * Called by `await_user_request` MCP tool handler.
   * Returns immediately if queue has items, otherwise blocks until enqueue() or timeout.
   * Throws if called concurrently (concurrent call guard — MCP SDK should serialize these,
   * but this is cheap insurance).
   */
  async waitForRequest(ms: number): Promise<QueuedRequest | null> {
    if (this.queue.length > 0) return this.queue.shift()!;
    if (this.resolver !== null) throw new Error('already waiting');
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.timeout = setTimeout(() => {
        if (this.resolver === resolve) {
          this.resolver = null;
          this.timeout = null;
          resolve(null);  // null → tool handler returns { type: 'no_request' }
        }
      }, ms);
    });
  }

  /** Number of requests queued (not counting one being actively waited on). */
  get pendingCount(): number { return this.queue.length; }
}

/**
 * Manages one SessionRequestQueue per prKey.
 * Instantiated once in server/src/index.ts alongside SessionManager.
 */
export class RequestQueueManager {
  private queues = new Map<string, SessionRequestQueue>();

  getQueue(prKey: string): SessionRequestQueue {
    if (!this.queues.has(prKey)) {
      this.queues.set(prKey, new SessionRequestQueue());
    }
    return this.queues.get(prKey)!;
  }
}
