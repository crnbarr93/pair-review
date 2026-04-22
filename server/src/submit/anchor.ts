import type { Thread } from '@shared/types';

export interface OctokitComment {
  path: string;
  body: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
  // Octokit TS types may incorrectly require `position` (issue #614).
  // Supply undefined to satisfy the type checker without using the deprecated param.
  position: undefined;
}

/**
 * D-09: line + side ONLY. Never position. Single adapter, no inline mapping.
 * BOTH maps to RIGHT (context lines anchor on the post-image side — Pitfall F).
 */
export function threadToOctokitComment(thread: Thread): OctokitComment {
  return {
    path: thread.path,
    body: thread.draftBody ?? '',
    line: thread.line,
    side: thread.side === 'BOTH' ? 'RIGHT' : thread.side,
    position: undefined,
  };
}

/**
 * Filter threads eligible for posting: must have draftBody and not be resolved.
 */
export function collectPostableThreads(threads: Record<string, Thread>): Thread[] {
  return Object.values(threads).filter(
    (t): t is Thread & { draftBody: string } => !!t.draftBody && !t.resolved
  );
}
