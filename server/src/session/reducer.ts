import type { ResolvedFinding, ReviewSession, SessionEvent, Thread } from '@shared/types';

/**
 * Phase 2 reducer. Pure function — no I/O, no async, no timestamp reads on the critical path.
 * Returns a NEW session object (never mutates input).
 *
 * INVARIANT: reducer does NOT touch the monotonic event counter. The SessionManager's applyEvent
 * orchestrator owns the counter (see 02-RESEARCH.md Pattern 2).
 */

/**
 * Convert a ResolvedFinding into a Thread object so that self-review findings
 * appear as editable discussion threads in the submission modal. The thread's
 * draftBody matches the format used by findingToOctokitComment in anchor.ts
 * (severity-prefixed title + rationale) so the GitHub comment content is consistent
 * whether posted via thread or finding path.
 *
 * If a thread already exists at the same lineId (e.g., from a walkthrough discussion),
 * the existing thread is preserved — we don't overwrite user-created threads.
 */
function findingToThread(finding: ResolvedFinding, generatedAt: string): Thread {
  return {
    threadId: `finding-${finding.id}`,
    lineId: finding.lineId,
    path: finding.path,
    line: finding.line,
    side: finding.side,
    preExisting: false,
    initiator: 'llm' as const,
    turns: [
      {
        author: 'llm' as const,
        message: `**[${finding.severity.toUpperCase()}] ${finding.title}**\n\n${finding.rationale}`,
        createdAt: generatedAt,
      },
    ],
    draftBody: `**[${finding.severity.toUpperCase()}] ${finding.title}**\n\n${finding.rationale}`,
    resolved: false,
    createdAt: generatedAt,
  };
}

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
    case 'selfReview.set': {
      // Create threads from findings so they appear as editable discussion threads
      // in the submission modal. Preserve existing threads (from walkthrough or user)
      // at the same lineId — user-created content takes priority.
      const existingThreads = s.threads ?? {};

      // Remove any previous finding-generated threads (prefix: 'finding-') so a
      // re-run of self-review replaces stale threads instead of accumulating them.
      const withoutOldFindingThreads: Record<string, Thread> = {};
      for (const [tid, thread] of Object.entries(existingThreads)) {
        if (!tid.startsWith('finding-')) {
          withoutOldFindingThreads[tid] = thread;
        }
      }

      // Recompute existingLineIds from non-finding threads only
      const nonFindingLineIds = new Set(
        Object.values(withoutOldFindingThreads).map((t) => t.lineId)
      );

      const newThreads: Record<string, Thread> = { ...withoutOldFindingThreads };
      for (const finding of e.selfReview.findings) {
        // Don't create a thread if a user/walkthrough thread already exists at this lineId
        if (nonFindingLineIds.has(finding.lineId)) continue;
        const thread = findingToThread(finding, e.selfReview.generatedAt);
        newThreads[thread.threadId] = thread;
      }

      return { ...s, selfReview: e.selfReview, threads: newThreads };
    }
    case 'walkthrough.set':
      return { ...s, walkthrough: e.walkthrough };
    case 'walkthrough.stepAdvanced':
      return {
        ...s,
        walkthrough: s.walkthrough
          ? {
              ...s.walkthrough,
              cursor: e.cursor,
              steps: s.walkthrough.steps.map((step, i) => {
                if (i === e.skippedIndex && step.status === 'pending') {
                  return { ...step, status: 'skipped' as const };
                }
                if (i < e.cursor && step.status === 'pending') {
                  return { ...step, status: 'visited' as const };
                }
                return step;
              }),
            }
          : s.walkthrough,
      };
    case 'walkthrough.stepToggled':
      return {
        ...s,
        walkthrough: s.walkthrough
          ? {
              ...s.walkthrough,
              steps: s.walkthrough.steps.map((step, i) =>
                i === e.index ? { ...step, status: e.status } : step
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
    case 'thread.draftSet': {
      const existing = s.threads?.[e.threadId];
      if (!existing) return s;
      return {
        ...s,
        threads: { ...s.threads, [e.threadId]: { ...existing, draftBody: e.body } },
      };
    }
    case 'thread.resolved': {
      const existing = s.threads?.[e.threadId];
      if (!existing) return s;
      return {
        ...s,
        threads: { ...s.threads, [e.threadId]: { ...existing, resolved: true } },
      };
    }
    // Phase 6 additions (D-16) — submission state machine and pending-review handling:
    case 'submission.proposed':
      return { ...s, pendingSubmission: { verdict: e.verdict, body: e.body } };
    case 'submission.confirmed':
      return { ...s, submissionState: { status: 'submitting', submissionId: e.submissionId } };
    case 'submission.completed':
      return {
        ...s,
        submissionState: {
          status: 'submitted',
          reviewId: e.reviewId,
          url: e.url,
          submissionId: e.submissionId,
        },
        pendingSubmission: undefined,
      };
    case 'submission.failed':
      return { ...s, submissionState: { status: 'failed', error: e.error } };
    case 'pendingReview.detected':
      return {
        ...s,
        pendingReview: {
          reviewId: e.reviewId,
          createdAt: e.createdAt,
          commentCount: e.commentCount,
        },
      };
    case 'pendingReview.resolved':
      return { ...s, pendingReview: undefined };
    // Phase 06.1 additions (D-20) — chat, user-initiated threads, request queue:
    case 'chat.userMessage':
      return {
        ...s,
        chatMessages: [
          ...(s.chatMessages ?? []),
          { author: 'user' as const, message: e.message, timestamp: e.timestamp },
        ],
      };
    case 'chat.llmMessage':
      return {
        ...s,
        chatMessages: [
          ...(s.chatMessages ?? []),
          { author: 'llm' as const, message: e.message, timestamp: e.timestamp },
        ],
      };
    case 'thread.userStarted': {
      const newThread: Thread = {
        threadId: e.threadId,
        lineId: e.lineId,
        path: e.path,
        line: e.line,
        side: e.side,
        preExisting: false,
        initiator: 'user' as const,
        turns: [{ author: 'user' as const, message: e.message, createdAt: e.timestamp }],
        // D-14: non-@claude comments auto-populate draft body for GitHub review submission.
        // @claude-tagged threads need LLM synthesis via draft_comment — leave draftBody undefined.
        draftBody: e.isClaudeTagged ? undefined : e.message,
        resolved: false,
        createdAt: e.timestamp,
      };
      return {
        ...s,
        threads: { ...(s.threads ?? {}), [e.threadId]: newThread },
      };
    }
    case 'request.queued':
      return {
        ...s,
        requestQueue: { pending: (s.requestQueue?.pending ?? 0) + 1 },
      };
    case 'request.processing':
      return {
        ...s,
        requestQueue: { pending: Math.max(0, (s.requestQueue?.pending ?? 0) - 1) },
      };
    // Phase 06.3 additions (D-15) — finding validity toggle:
    case 'finding.validitySet': {
      if (!s.selfReview) return s;
      const updatedFindings = s.selfReview.findings.map(f =>
        f.id === e.findingId ? { ...f, validity: e.validity } : f
      );
      return { ...s, selfReview: { ...s.selfReview, findings: updatedFindings } };
    }
    default: {
      // Exhaustiveness guard — adding an event variant without handling it is a compile error.
      const _never: never = e;
      throw new Error(`Unknown event type: ${JSON.stringify(_never)}`);
    }
  }
}
