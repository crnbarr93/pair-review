import type { Thread, ResolvedFinding } from '@shared/types';

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

/**
 * Convert a ResolvedFinding to an OctokitComment for the GitHub createReview API.
 * Body format: severity-prefixed title + rationale.
 */
export function findingToOctokitComment(finding: ResolvedFinding): OctokitComment {
  return {
    path: finding.path,
    body: `**[${finding.severity.toUpperCase()}] ${finding.title}**\n\n${finding.rationale}`,
    line: finding.line,
    side: finding.side === 'BOTH' ? 'RIGHT' : finding.side,
    position: undefined,
  };
}

/**
 * Return findings that don't already have a postable thread at the same lineId.
 * Thread comments take priority (they contain the user's own words from walkthrough discussion).
 */
export function collectPostableFindings(
  findings: ResolvedFinding[],
  threads: Record<string, Thread>
): ResolvedFinding[] {
  const postableThreadLineIds = new Set(
    collectPostableThreads(threads).map((t) => t.lineId)
  );
  return findings.filter((f) => !postableThreadLineIds.has(f.lineId));
}
