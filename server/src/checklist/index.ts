/**
 * Built-in criticality-ranked checklist. D-02: TS const, no filesystem I/O, no JSON, no markdown.
 * Consumed by:
 *   - server/src/mcp/tools/run-self-review.ts -- interpolated into the tool description at
 *     server-start time so the Claude Code session sees the adversarial-framing list (D-20).
 *   - server/src/mcp/tools/run-self-review.ts handler -- validates Finding.checklistItemId
 *     against this array's id set.
 *
 * Criticality:
 *   1 = foundational (behavior correctness, auth, data integrity; skip-at-peril)
 *   2 = substantive (tests, error handling, concurrency; flag for reviewer attention)
 *   3 = advisory (style, naming, maintenance signals; skip under time pressure)
 *
 * v2 (CHECK-V2-01): a repo-local `.review/checklist.md` override. Deferred; not shipped in Phase 4.
 */

export interface ChecklistItem {
  id: string;
  category: 'correctness' | 'security' | 'tests' | 'performance' | 'style';
  criticality: 1 | 2 | 3;
  text: string;
  evaluationHint?: string;
}

export const CHECKLIST: readonly ChecklistItem[] = [
  // --- Correctness (5 items) ---------------------------------------------------
  {
    id: 'c-01',
    category: 'correctness',
    criticality: 1,
    text: 'Does changed code handle null / undefined / empty inputs without crashing?',
    evaluationHint:
      'Look for new accesses on possibly-nullable values; bug-fix intent raises the bar.',
  },
  {
    id: 'c-02',
    category: 'correctness',
    criticality: 1,
    text: 'Are error and failure paths implemented, not just the happy path?',
    evaluationHint:
      'Every thrown exception, every rejected promise, every non-2xx response branch.',
  },
  {
    id: 'c-03',
    category: 'correctness',
    criticality: 1,
    text: 'Do boundary conditions (zero, one, maximum, empty collection) behave correctly?',
  },
  {
    id: 'c-04',
    category: 'correctness',
    criticality: 2,
    text: 'Are race conditions or shared-state mutations safe under concurrent access?',
    evaluationHint:
      'Event-sourced reducers (this codebase) demand careful per-prKey serialization.',
  },
  {
    id: 'c-05',
    category: 'correctness',
    criticality: 2,
    text: 'Does the diff match the stated intent from the PR description? (Refactor should not change observable behavior.)',
    evaluationHint:
      'D-21 intent-to-review-lens: refactor PRs flag any behavior-affecting change.',
  },

  // --- Security (5 items) ------------------------------------------------------
  {
    id: 's-01',
    category: 'security',
    criticality: 1,
    text: 'Is untrusted input (request bodies, query params, file contents) validated at the boundary?',
    evaluationHint:
      'Zod schemas, regex allowlists, length caps -- not post-hoc sanitization.',
  },
  {
    id: 's-02',
    category: 'security',
    criticality: 1,
    text: 'Are authentication / authorization checks in place for every new endpoint or privileged action?',
  },
  {
    id: 's-03',
    category: 'security',
    criticality: 1,
    text: 'Is user-authored content rendered as text (React text nodes) rather than HTML (innerHTML / dangerouslySetInnerHTML)?',
    evaluationHint:
      'XSS floor -- every LLM or user text field must render as text, never as HTML.',
  },
  {
    id: 's-04',
    category: 'security',
    criticality: 2,
    text: 'Are secrets (tokens, keys, session IDs) kept out of logs, error messages, and client responses?',
  },
  {
    id: 's-05',
    category: 'security',
    criticality: 2,
    text: 'Do new shell-outs (exec, spawn) use argv arrays rather than string concatenation with user data?',
    evaluationHint:
      'Command injection -- execa(cmd, [...argv]) safe; execa(`${cmd} ${userArg}`) not safe.',
  },

  // --- Tests (5 items) ---------------------------------------------------------
  {
    id: 't-01',
    category: 'tests',
    criticality: 1,
    text: 'Is new behavior covered by tests that would fail without the change?',
    evaluationHint:
      'RED first -- a passing test that would pass before the diff is not covering the change.',
  },
  {
    id: 't-02',
    category: 'tests',
    criticality: 1,
    text: 'Do bug-fix PRs include a regression test that reproduces the reported bug?',
    evaluationHint:
      'Intent=bug-fix without a failing-before-fix test is a red flag.',
  },
  {
    id: 't-03',
    category: 'tests',
    criticality: 2,
    text: 'Are error paths, edge cases, and boundary conditions tested -- not just the happy path?',
  },
  {
    id: 't-04',
    category: 'tests',
    criticality: 2,
    text: 'Are tests deterministic (no timing races, no network dependencies, no order coupling)?',
  },
  {
    id: 't-05',
    category: 'tests',
    criticality: 3,
    text: 'Do test names describe the behavior under test (not the implementation being called)?',
  },

  // --- Performance (4 items) ---------------------------------------------------
  {
    id: 'p-01',
    category: 'performance',
    criticality: 2,
    text: 'Are there obvious algorithmic regressions (O(n^2) where O(n) was, or new N+1 query patterns)?',
  },
  {
    id: 'p-02',
    category: 'performance',
    criticality: 2,
    text: 'Are large payloads (diff data, LLM responses) paginated or bounded to avoid context exhaustion?',
    evaluationHint:
      'Pitfall 5 BLOCKER -- tool responses over ~2k tokens saturate the session context.',
  },
  {
    id: 'p-03',
    category: 'performance',
    criticality: 3,
    text: 'Are synchronous I/O calls or blocking operations kept off hot paths?',
  },
  {
    id: 'p-04',
    category: 'performance',
    criticality: 3,
    text: 'Are caches / memoization introduced only where a real bottleneck is demonstrated?',
    evaluationHint:
      'Cache invalidation is the hard part -- premature caches are a defect source, not a win.',
  },

  // --- Style (5 items) ---------------------------------------------------------
  {
    id: 'st-01',
    category: 'style',
    criticality: 3,
    text: 'Do identifiers (functions, variables, types) describe what they do, not how they do it?',
  },
  {
    id: 'st-02',
    category: 'style',
    criticality: 3,
    text: 'Are public APIs documented (JSDoc / TSDoc on exported functions / interfaces)?',
  },
  {
    id: 'st-03',
    category: 'style',
    criticality: 3,
    text: 'Are there dead branches, commented-out code, debug logs, or TODO comments without owners?',
  },
  {
    id: 'st-04',
    category: 'style',
    criticality: 3,
    text: 'Is new code consistent with existing patterns in the same module / file?',
  },
  {
    id: 'st-05',
    category: 'style',
    criticality: 3,
    text: 'Are import paths clean (no circular dependencies, no deep internal-module reaches)?',
  },
] as const;
