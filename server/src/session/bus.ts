import { EventEmitter } from 'node:events';
import type { ReviewSession, SessionEvent } from '@shared/types';
import { logger } from '../logger.js';

export interface SessionUpdatedPayload {
  id: string; // prKey
  event: SessionEvent;
  state: ReviewSession;
}

type Listener = (payload: SessionUpdatedPayload) => void;

/**
 * Typed pub-sub over Node's built-in EventEmitter.
 * Single event channel in Phase 2: 'session:updated'.
 * Listener errors are caught + logged to stderr; they never propagate to other listeners.
 */
export class SessionBus {
  private emitter = new EventEmitter();
  private wrapped = new WeakMap<Listener, Listener>();

  on(event: 'session:updated', listener: Listener): void {
    this.emitter.on(event, this.safeWrap(listener));
  }

  off(event: 'session:updated', listener: Listener): void {
    // Node's EventEmitter .off() requires the same function reference that was passed to .on().
    // To support this, we stash the wrapped listener on the user-provided listener via a WeakMap.
    const wrapped = this.wrapped.get(listener);
    if (wrapped) {
      this.emitter.off(event, wrapped);
      this.wrapped.delete(listener);
    }
  }

  emit(event: 'session:updated', payload: SessionUpdatedPayload): void {
    this.emitter.emit(event, payload);
  }

  private safeWrap(listener: Listener): Listener {
    const wrapped: Listener = (payload) => {
      try {
        listener(payload);
      } catch (err) {
        logger.warn('SessionBus listener threw — continuing', err);
      }
    };
    this.wrapped.set(listener, wrapped);
    return wrapped;
  }
}
