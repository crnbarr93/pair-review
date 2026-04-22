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
  generated: boolean;         // Phase 3 D-14: true if path matches GENERATED_PATTERNS allowlist
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
  // Phase 3 additions (all optional — pre-Phase-3 sessions omit them):
  fileReviewStatus?: Record<string, FileReviewStatus>;
  expandedGeneratedFiles?: Record<string, boolean>;
  existingComments?: ReadOnlyComment[];
  ciStatus?: CIStatus;
  // Phase 4 additions (D-18) — optional so pre-Phase-4 snapshots load without migration:
  summary?: PrSummary | null;
  selfReview?: SelfReview | null;
  // Phase 5 additions (D-19) — optional so pre-Phase-5 snapshots load without migration:
  walkthrough?: Walkthrough | null;
  threads?: Record<string, Thread>;
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
  | { type: 'session.viewBoth' }
  // Phase 3 additions (D-27):
  | { type: 'file.reviewStatusSet'; fileId: string; status: FileReviewStatus }
  | { type: 'file.generatedExpandToggled'; fileId: string; expanded: boolean }
  | { type: 'existingComments.loaded'; comments: ReadOnlyComment[] }
  | { type: 'ciChecks.loaded'; ciStatus: CIStatus }
  // Phase 4 additions (D-17):
  | { type: 'summary.set'; summary: PrSummary }
  | { type: 'selfReview.set'; selfReview: SelfReview }
  // Phase 5 additions (D-18):
  | { type: 'walkthrough.set'; walkthrough: Walkthrough }
  | { type: 'walkthrough.stepAdvanced'; cursor: number }
  | { type: 'walkthrough.showAllToggled'; showAll: boolean }
  | { type: 'thread.replyAdded'; threadId: string; thread: Thread }
  | { type: 'thread.draftSet'; threadId: string; body: string }
  | { type: 'thread.resolved'; threadId: string };

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
  // Phase 3 additions (mirrored from ReviewSession for web consumption):
  fileReviewStatus?: Record<string, FileReviewStatus>;
  expandedGeneratedFiles?: Record<string, boolean>;
  existingComments?: ReadOnlyComment[];
  ciStatus?: CIStatus;
  // Phase 4 additions (mirrored from ReviewSession for web consumption):
  summary?: PrSummary | null;
  selfReview?: SelfReview | null;
  /** D-12: sidebar visibility. Auto-opens on first selfReview.set per UI-SPEC FindingsSidebar contract. */
  findingsSidebarOpen: boolean;
}

// Phase 3 additions (D-11 state machine)
export type FileReviewStatus = 'untouched' | 'in-progress' | 'reviewed';

// Phase 3 addition — existing PR review comment, server-resolved to a DiffLine.id.
// SECURITY: `body` MUST be rendered via React text nodes in the client — never innerHTML (T-3-03).
export interface ReadOnlyComment {
  id: number;
  lineId: string | null;   // null = orphan (hidden in Phase 3; server logs count to stderr per D-22)
  path: string;
  line: number | null;
  side: 'LEFT' | 'RIGHT' | 'BOTH';
  author: string;
  createdAt: string;       // ISO timestamp
  body: string;            // Raw GitHub comment body — render via React text nodes, NOT innerHTML
  htmlUrl: string;         // "View on GitHub" link destination
  threadId?: number;       // in_reply_to_id — used for visual grouping in Phase 3
}

// Phase 3 addition — CI check run (normalized from `gh pr checks --json name,state,bucket,link`).
// NOTE: gh CLI field names are `bucket` and `link` — NOT `conclusion`/`detailsUrl`.
// See PROJECT.md Key Decision (Phase 3, gh-pr-checks field correction).
export interface CheckRun {
  name: string;
  bucket: 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel';
  link: string;   // external details URL
}

export interface CIStatus {
  aggregate: 'pass' | 'fail' | 'pending' | 'none';
  checks: CheckRun[];
}

// -------------------------------------------------------------------------
// Phase 4 additions — LLM Summary + Checklist + Self-Review
// D-06: PrSummary is a structured-fields blob, not markdown.
// D-01: SelfReview is atomic — one tool call replaces the whole blob.
// D-04: Findings anchor via opaque lineId only; server resolves to (path, line, side) before storing.
// D-18: ReviewSession gains optional summary/selfReview fields (zero-migration for pre-Phase-4 snapshots).
// -------------------------------------------------------------------------

/** Severity enum for findings. D-01/D-03: 'nit' is schema-capped at 3 per payload. */
export type Severity = 'blocker' | 'major' | 'minor' | 'nit';

/** Checklist category partition. D-02: fixed set of 5 — matches CHECKLIST const in server/src/checklist/. */
export type ChecklistCategory = 'correctness' | 'security' | 'tests' | 'performance' | 'style';

/** Review verdict. D-05: default is 'request_changes' (enforced at the zod schema in Plan 04-06). */
export type Verdict = 'request_changes' | 'comment' | 'approve';

/** Per-category coverage map. Derived from findings server-side at run_self_review time. */
export type CategoryCoverage = Record<ChecklistCategory, 'pass' | 'partial' | 'fail'>;

/**
 * Intent classification from set_pr_summary. D-06: structural hook that downstream
 * self-review prompt framing can key off (refactor -> behavior preservation; feature -> correctness+tests).
 */
export type SummaryIntent = 'bug-fix' | 'refactor' | 'feature' | 'chore' | 'other';

/**
 * Structured summary of a PR.
 * D-06/D-09: paraphrase restates the author's description, NOT the diff.
 * SECURITY: paraphrase, keyChanges[], riskAreas[] are LLM-authored text. Render via React text
 * nodes in the client — NEVER innerHTML (T-4-01-04).
 */
export interface PrSummary {
  intent: SummaryIntent;
  intentConfidence: number;   // 0-1 inclusive (zod-bounded in Plan 04-05)
  /** Author-framing paraphrase — NOT a diff summary. Max ~2000 chars (Plan 04-05 zod).
   * SECURITY: render via React text nodes, NEVER innerHTML. */
  paraphrase: string;
  /** Each item: one-line description of a core change.
   * SECURITY: render via React text nodes, NEVER innerHTML. */
  keyChanges: string[];
  /** Each item: one-line call-out for reviewer attention.
   * SECURITY: render via React text nodes, NEVER innerHTML. */
  riskAreas: string[];
  generatedAt: string;        // ISO timestamp (plain string — no Date instance).
}

/**
 * Finding as supplied by the LLM to run_self_review — anchored by opaque lineId only (D-04).
 * This type documents the pre-resolution shape; the zod schema in Plan 04-06 is the runtime gate.
 * SECURITY: title, rationale are LLM-authored text. Render via React text nodes — NEVER innerHTML (T-4-01-03).
 */
export interface Finding {
  category: ChecklistCategory;
  checklistItemId: string;    // References a CHECKLIST item id (e.g., 'c-01').
  severity: Severity;
  lineId: string;             // Format: `${fileId}:h${hunkIdx}:l${lineIdx}` (Phase 1 D-17 rail).
  /** Short headline. Max 200 chars (Plan 04-06 zod).
   * SECURITY: render via React text nodes, NEVER innerHTML. */
  title: string;
  /** Evidence-bearing explanation. Max 2000 chars (Plan 04-06 zod).
   * SECURITY: render via React text nodes, NEVER innerHTML. */
  rationale: string;
}

/**
 * Finding after server-side lineId resolution (D-04). Carries both the opaque lineId AND the
 * resolved (path, line, side) triplet so the UI renders file:line without re-resolving and
 * downstream phases (Phase 5 draft_comment) can inherit the resolved position.
 * SECURITY: title, rationale, path are rendered as text in the UI — React auto-escapes.
 */
export interface ResolvedFinding {
  id: string;                 // Server-generated unique id (e.g., nanoid).
  category: ChecklistCategory;
  checklistItemId: string;
  severity: Severity;
  lineId: string;             // Same opaque anchor the LLM supplied.
  path: string;               // Server-resolved from lineId — never LLM-supplied.
  line: number;               // Server-resolved (1-indexed file line from DiffLine.fileLine).
  side: LineSide;             // Server-resolved from DiffLine.side.
  /** Max 200 chars (enforced in Plan 04-06).
   * SECURITY: render via React text nodes, NEVER innerHTML. */
  title: string;
  /** Max 2000 chars (enforced in Plan 04-06).
   * SECURITY: render via React text nodes, NEVER innerHTML. */
  rationale: string;
}

/**
 * Atomic self-review blob. D-01: one run_self_review tool call replaces the whole blob.
 * D-08: silent replace on regenerate — reducer never merges.
 */
export interface SelfReview {
  findings: ResolvedFinding[];
  coverage: CategoryCoverage;
  verdict: Verdict;
  generatedAt: string;        // ISO timestamp.
}

// -------------------------------------------------------------------------
// Phase 5 additions — Walkthrough + Inline Threaded Comments
// D-01: Walkthrough at hunk-level granularity.
// D-13: threadId is server-generated nanoid; lineId is the Phase-1 opaque rail extended to threads.
// D-19: ReviewSession gains walkthrough/threads fields (all optional for backward compat).
// -------------------------------------------------------------------------

export type WalkthroughStepStatus = 'pending' | 'visited' | 'skipped';

export interface WalkthroughStep {
  stepNum: number;
  hunkId: string;
  /** SECURITY: render via React text nodes, NEVER innerHTML. */
  commentary: string;
  status: WalkthroughStepStatus;
}

export interface Walkthrough {
  steps: WalkthroughStep[];
  cursor: number;
  showAll: boolean;
  generatedAt: string;
}

export interface ThreadTurn {
  author: 'llm' | 'user';
  /** SECURITY: render via React text nodes, NEVER innerHTML. */
  message: string;
  createdAt: string;
}

export interface Thread {
  threadId: string;
  lineId: string;
  path: string;
  line: number;
  side: LineSide;
  preExisting: boolean;
  turns: ThreadTurn[];
  /** SECURITY: render via React text nodes, NEVER innerHTML. */
  draftBody?: string;
  resolved: boolean;
  createdAt: string;
}
