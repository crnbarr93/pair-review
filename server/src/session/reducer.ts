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
    case 'file.reviewStatusSet':
      return {
        ...s,
        fileReviewStatus: {
          ...(s.fileReviewStatus ?? {}),
          [e.fileId]: e.status,
        },
      };
    case 'file.generatedExpandToggled':
      return {
        ...s,
        expandedGeneratedFiles: {
          ...(s.expandedGeneratedFiles ?? {}),
          [e.fileId]: e.expanded,
        },
      };
    case 'existingComments.loaded':
      return { ...s, existingComments: e.comments };
    case 'ciChecks.loaded':
      return { ...s, ciStatus: e.ciStatus };
    case 'summary.set':
      return { ...s, summary: e.summary };
    case 'selfReview.set':
      return { ...s, selfReview: e.selfReview };
    case 'walkthrough.set':
      return { ...s, walkthrough: e.walkthrough };
    case 'walkthrough.stepAdvanced':
      return {
        ...s,
        walkthrough: s.walkthrough
          ? {
              ...s.walkthrough,
              cursor: e.cursor,
              steps: s.walkthrough.steps.map((step, i) =>
                i < e.cursor && step.status === 'pending'
                  ? { ...step, status: 'visited' as const }
                  : step
              ),
            }
          : s.walkthrough,
      };
    case 'walkthrough.showAllToggled':
      return {
        ...s,
        walkthrough: s.walkthrough ? { ...s.walkthrough, showAll: e.showAll } : s.walkthrough,
      };
    case 'thread.replyAdded':
      return {
        ...s,
        threads: { ...(s.threads ?? {}), [e.threadId]: e.thread },
      };
    case 'thread.draftSet':
      return {
        ...s,
        threads: s.threads
          ? { ...s.threads, [e.threadId]: { ...s.threads[e.threadId], draftBody: e.body } }
          : s.threads,
      };
    case 'thread.resolved':
      return {
        ...s,
        threads: s.threads
          ? { ...s.threads, [e.threadId]: { ...s.threads[e.threadId], resolved: true } }
          : s.threads,
      };
    default: {
      // Exhaustiveness guard — adding an event variant without handling it is a compile error.
      const _never: never = e;
      throw new Error(`Unknown event type: ${JSON.stringify(_never)}`);
    }
  }
}
