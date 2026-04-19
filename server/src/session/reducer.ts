import type { ReviewSession, SessionEvent } from '@shared/types';

/**
 * Phase 2 reducer. Pure function — no I/O, no async, no timestamp reads on the critical path.
 * Returns a NEW session object (never mutates input).
 *
 * INVARIANT: reducer does NOT touch the monotonic event counter. The SessionManager's applyEvent
 * orchestrator owns the counter (see 02-RESEARCH.md Pattern 2).
 */
export function applyEvent(s: ReviewSession, e: SessionEvent): ReviewSession {
  switch (e.type) {
    case 'session.adoptNewDiff':
      return {
        ...s,
        diff: e.newDiff,
        headSha: e.newHeadSha,
        pr: { ...s.pr, headSha: e.newHeadSha },
        shikiTokens: e.newShikiTokens,
        staleDiff: undefined,
      };
    case 'session.reset':
      // Phase 2: reset flag drives the HTTP handler to delete state.json + re-ingest.
      // The deletion itself is NOT a reducer responsibility (I/O).
      return { ...s, pendingReset: true };
    case 'session.viewBoth':
      // Phase 2 stub: flag only. UI consumption lands in Plan 04.
      return { ...s, viewBothMode: true, staleDiff: undefined };
    default: {
      // Exhaustiveness guard — adding an event variant without handling it is a compile error.
      const _never: never = e;
      throw new Error(`Unknown event type: ${JSON.stringify(_never)}`);
    }
  }
}
