// Source of truth for Phase 1 type surface. See 01-CONTEXT D-17 (opaque IDs) and 01-RESEARCH Pattern 6 (DiffModel shape).
// Downstream plans import from this file — do not re-declare these types.

// Shape of `gh pr view --json` output for D-15 fields
export interface GitHubPrViewJson {
  title: string;
  body: string;
  author: { login: string };
  baseRefName: string;
  headRefName: string;
  baseRefOid: string;
  headRefOid: string;
  additions: number;
  deletions: number;
  changedFiles: number;
}

export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed';
export type LineKind = 'add' | 'del' | 'context';
export type LineSide = 'LEFT' | 'RIGHT' | 'BOTH';

export interface DiffLine {
  id: string;                 // `${fileId}:h${hunkIdx}:l${lineIdx}` — opaque, server-resolved (D-17)
  kind: LineKind;
  side: LineSide;
  fileLine: number;           // Line number in file (post-image for add/context, pre-image for del)
  diffPosition: number;       // Unified-diff position — needed for GitHub API in Phase 6
  text: string;
}

export interface Hunk {
  id: string;                 // `${fileId}:h${index}` — opaque, server-resolved (D-17)
  header: string;             // `@@ -10,7 +10,8 @@ function foo()`
  lines: DiffLine[];
}

export interface DiffFile {
  id: string;                 // sha1(path).slice(0,12) — opaque
  path: string;
  oldPath?: string;           // Populated on rename
  status: FileStatus;
  binary: boolean;
  hunks: Hunk[];
}

export interface DiffModel {
  files: DiffFile[];
  totalHunks: number;
}

// Shiki tokens — one inner array per line, one outer per hunk, one per file
export type ShikiToken = { content: string; color?: string; fontStyle?: number };
export type ShikiHunkTokens = ShikiToken[][];     // tokens[lineIdx] = ShikiToken[]
export type ShikiFileTokens = ShikiHunkTokens[];  // tokens[hunkIdx] = ShikiHunkTokens

// PR metadata (GitHub) — mirrors `gh pr view --json` fields in D-15
export interface PullRequestMeta {
  source: 'github' | 'local';
  title: string;
  description: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  baseSha: string;
  headSha: string;
  additions: number;
  deletions: number;
  filesChanged: number;
  // GitHub-only:
  number?: number;
  owner?: string;
  repo?: string;
  url?: string;
}

export interface ReviewSession {
  prKey: string;              // `gh:<owner>/<repo>#<number>` or `local:<sha256>` (D-05)
  pr: PullRequestMeta;
  diff: DiffModel;
  shikiTokens: Record<string, ShikiFileTokens>;  // keyed by DiffFile.id
  createdAt: string;          // ISO
  headSha: string;            // Duplicated from pr.headSha for Phase 2 stale-diff detection
  error: null | { variant: 'fetch-failed'; message: string };
  // Phase 2 additions
  staleDiff?: { storedSha: string; currentSha: string };
  viewBothMode?: boolean;
  pendingReset?: boolean;
  lastEventId: number;   // monotonic per-session counter; starts at 0 on first persist
}

// Phase 2 event union — Phase 4/5/6 variants will extend this.
// Every SessionEvent MUST be a plain JSON-serializable object (no Date, no functions).
export type SessionEvent =
  | {
      type: 'session.adoptNewDiff';
      newDiff: DiffModel;
      newHeadSha: string;
      newShikiTokens: Record<string, ShikiFileTokens>;
    }
  | { type: 'session.reset' }
  | { type: 'session.viewBoth' };

// SSE message envelope (server → browser)
export interface SnapshotMessage {
  type: 'snapshot';
  session: ReviewSession;
  launchUrl: string;          // Shown in footer per UI-SPEC
  tokenLast4: string;         // For footer "Token: ••••[last4]" display — NEVER the full token
}

// SSE update envelope (server → browser) — pushed on every applyEvent per D-02
export interface UpdateMessage {
  type: 'update';
  event: SessionEvent;
  state: ReviewSession;
}

// Client app state machine (UI-SPEC §<DiffCanvas> four states)
export type AppStatePhase = 'loading' | 'empty' | 'error' | 'diff';
export interface AppState {
  phase: AppStatePhase;
  session: { active: boolean };
  pr?: PullRequestMeta;
  diff?: DiffModel;
  shikiTokens?: Record<string, ShikiFileTokens>;
  errorVariant?: 'unreachable' | 'fetch-failed';
  launchUrl: string;
  tokenLast4: string;
}
