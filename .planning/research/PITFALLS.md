# Pitfalls Research

**Domain:** Claude Code plugin — LLM-assisted GitHub PR review via local web GUI + MCP tools
**Researched:** 2026-04-16
**Confidence:** HIGH (GitHub API + MCP + localhost-security findings are authoritative; LLM-review pitfalls triangulated from multiple credible sources + directly applicable to project shape)

Scope note: this is a personal, single-user tool running on macOS. Pitfalls that matter for hosted/team tools (multi-tenant auth, CI scale, enterprise rate limits) are deliberately downscored. What we care about: does the daily-driver loop break, is GitHub getting garbage, is the LLM producing fake-looking output, is local state being lost.

---

## Critical Pitfalls

### Pitfall 1: GitHub review-comment positioning — `position` vs `line`/`side` confusion

**What goes wrong:**
Inline comments land on the wrong line, on a line the user never intended, or the API call 422s after the LLM has spent tokens drafting the comment. The classic failure: the LLM thinks "file X line 42" means `line: 42` in the API, but GitHub's legacy `position` parameter is the 1-indexed offset into the *unified diff hunk*, not the file. Mixing them produces off-by-N errors where N is the size of upstream context lines.

**Why it happens:**
GitHub has two coexisting coordinate systems for review comments. The older `position` parameter counts lines down from the first `@@` hunk header, continuing through whitespace and additional hunks. The newer `line` + `side` (`LEFT`/`RIGHT`) + optional `start_line`/`start_side` model uses actual file line numbers and is what every human mental model expects. GitHub is deprecating `position` but still accepts it, and many Octokit examples and LLM training data mix the two — so a generated tool call that "looks right" silently uses the wrong semantics. Multi-line comments add a second trap: you must pass the *last* line as `line` and the *first* as `start_line`, not the other way around.

**How to avoid:**
Standardize on `line` + `side` (+ `start_line`/`start_side` for ranges) throughout the plugin — never `position`. Build a single internal `Anchor` type that is always `{ path, side, startLine, endLine }` and have exactly one adapter that maps it to the Octokit payload. Add an integration test that posts a review comment against a fixture PR and asserts the comment lands on the expected line by reading it back.

**Warning signs:**
Comments appearing one or two lines off in the GitHub UI; 422 responses with "pull_request_review_thread.line must be part of the diff"; comments on deleted lines appearing on the `RIGHT` side (should be `LEFT`); multi-line comments rendering as single-line.

**Phase to address:**
Phase where GitHub review submission lands — ship with the test fixture before any "looks good, works on my PR" manual verification.

**Severity:** BLOCKER. This is the signature failure mode of LLM-driven GitHub review tooling and the visible artifact of a broken tool.

---

### Pitfall 2: LLM hallucinated line numbers and file paths in comment drafts

**What goes wrong:**
Even with the coordinate system correct (Pitfall 1), the LLM invents line numbers that don't exist in the diff, cites `src/auth/login.ts:142` when the file is `src/auth/Login.tsx` and only has 87 lines, or anchors a comment to an unchanged line the diff doesn't include. Published research shows LLMs frequently cite incorrect line numbers even when they can quote the correct line content when asked directly.

**Why it happens:**
LLMs are trained to produce plausible-looking output, not verified output. Line numbers are numeric tokens with weak grounding — they don't "feel wrong" to a next-token predictor the way a misspelled function name might. In an MCP tool-call setting the model often writes the comment body first and backfills the anchor from memory rather than re-reading the diff.

**How to avoid:**
Never let the LLM supply `(path, line)` as freeform strings in the `post_comment` MCP tool. Instead, have the walkthrough tool return an opaque `hunk_id` (e.g. `sha256(path + old_line + new_line)`) and `line_ids` within each hunk; the `post_comment` tool accepts only those IDs plus a body. The MCP server resolves IDs → coordinates server-side, rejecting unknown IDs with a clear error. This is the "stringly-typed vs typed reference" discipline applied to tool schemas.

**Warning signs:**
Comments trying to anchor to paths not in the PR file list; line numbers exceeding the file's length; `post_comment` calls that would land outside any hunk; LLM quoting code in the comment body that doesn't match the code at the cited line.

**Phase to address:**
MCP tool-schema design phase, before any walkthrough/comment flow is wired up. Lock the opaque-ID pattern in the schema and the whole class of failures disappears.

**Severity:** BLOCKER. Without server-side resolution, every other pitfall downstream of comment posting compounds.

---

### Pitfall 3: Nitpick flood drowns critical findings

**What goes wrong:**
The LLM produces 40 comments — 36 are "consider extracting this to a constant" / "this variable name could be clearer" and 4 are "this auth check bypasses the ACL". The real findings get lost in the noise, the user stops reading carefully by comment 15, and the posted review looks like a static-analyzer dump rather than a reviewer. Industry data: 70-90% of typical AI review comments are ignored as noise; reviews with higher signal-ratio drive more actual code changes.

**Why it happens:**
The default "review this code" prompt has no criticality budget. LLMs will happily emit every observation because there's no cost function telling them restraint is valuable. The checklist in PROJECT.md is "criticality-ranked" which is the right instinct, but ranking the checklist doesn't automatically rank the *output* comments.

**How to avoid:**
Enforce a comment budget and severity tagging in the tool schema. Every drafted comment must carry `severity: blocker | concern | nit` and the UI/tool-prompt must cap nits (hard cap, e.g. max 3 nits per review; blockers uncapped). The self-review pass should explicitly ask "is this blocker-worthy, concern-worthy, or a nit?" and require the LLM to justify anything above nit. Surface the signal ratio (blockers+concerns / total) in the review summary so the user sees if this review is noisy before submitting.

**Warning signs:**
Review posted with >5 `nit`-level comments; signal ratio < 40%; all comments at the same severity (flat distribution = the LLM isn't triaging); comments saying "consider", "might want to", "you could" without a "because X breaks when Y" follow-up.

**Phase to address:**
Self-review / checklist phase. The severity tagging lives in the prompt and tool schema — not a post-hoc filter.

**Severity:** SERIOUS. Tool remains functional but core value ("better than reviewing alone") is not delivered.

---

### Pitfall 4: Self-review becomes blandly positive instead of adversarial

**What goes wrong:**
The self-review step produces "Looks good overall! Minor suggestion: consider adding a comment here." for code that has a genuine race condition, a missing error path, or a broken invariant. The LLM defaults to sycophantic agreement mode instead of adversarial critique, especially on well-structured code.

**Why it happens:**
RLHF-trained models are biased toward agreement and positivity unless explicitly prompted otherwise. "Review this PR" gets pattern-matched to "summarize and compliment this PR". The problem is worse when the PR description is well-written — the LLM reads intent, decides it matches, and rubber-stamps.

**How to avoid:**
The self-review prompt must frame the LLM as an adversarial reviewer whose job is to find reasons to request changes, not approve. Force category-by-category output against the criticality-ranked checklist with "no finding" required as an explicit (and rare) terminal state. Include a "devil's advocate" pass that explicitly asks: what could break this? what did the author probably forget? what happens at the boundaries (null, empty, error, concurrent)? Verdict default should be "Request changes" on first generation, forcing the LLM to argue it down to "Comment" or "Approve" — not the inverse.

**Warning signs:**
Default verdict is always "Approve" on first pass; self-review output contains "looks good", "nicely done", "great work"; no checklist category produces a finding; checklist is run but the comments are all "✓ no issues" with no reasoning.

**Phase to address:**
Self-review phase. Prompting discipline + default-verdict-inversion are prompt-engineering concerns that ship with the checklist feature.

**Severity:** SERIOUS. This is the difference between "competent co-reviewer" and "yes-man" — the core-value sentence in PROJECT.md depends on getting this right.

---

### Pitfall 5: Context window exhaustion on large PRs

**What goes wrong:**
A 5000-line PR is fetched in full, the entire diff is dumped into one MCP tool response, the LLM's context fills, and either (a) the tool response is truncated silently (many MCP clients have a ~25k token hard ceiling on individual tool responses), or (b) the LLM loses its running review state, or (c) later hunks are reviewed with the earlier hunks' context evicted, breaking cross-file reasoning.

**Why it happens:**
The naive MCP tool design is `get_pr_diff()` → returns the whole diff. This pattern is well-documented as a token-bloat antipattern for MCP servers. Claude Code + MCP enforces hard per-response ceilings; beyond that, even within the ceiling, stuffing 20k tokens of diff every tool call burns context that should be reserved for review reasoning.

**How to avoid:**
The MCP tool surface must be hunk-paginated, not diff-wholesale. Tools are shaped like `list_files()` (summaries: path, +/-, hunk count), `get_hunk(hunk_id)` (single hunk content), `get_file_context(path, around_line)` (narrow context expansion). Never return > ~2k tokens in a single tool response. The walkthrough's "show all" mode iterates hunks one at a time via `next_hunk()`, not a single mega-response. Cache full diff on disk server-side; model sees summaries + IDs + on-demand fetches.

**Warning signs:**
A single tool response > 5000 tokens; MCP errors like "response exceeds maximum allowed tokens"; LLM losing track of earlier findings mid-walkthrough; hunks beyond position N consistently reviewed more shallowly than hunks before N.

**Phase to address:**
MCP tool-schema design phase, alongside Pitfall 2. These two pitfalls dictate the entire tool surface shape.

**Severity:** BLOCKER for any PR larger than trivial. The moment the author tries to review a real PR, this breaks.

---

### Pitfall 6: DNS rebinding / CSRF on the local web UI

**What goes wrong:**
The plugin runs an HTTP+websocket server on `127.0.0.1:SOMEPORT`. A malicious website the author visits in another tab crafts requests (DNS rebinding a hostname to 127.0.0.1, or relying on the browser sending cookies to any localhost origin) that hit the plugin's server and post comments, submit reviews, or exfiltrate PR content. This is a known, documented attack class for localhost-bound MCP / dev servers — not a hypothetical.

**Why it happens:**
From the browser's perspective, `localhost` is just a domain. Same-Origin Policy does not stop a request *going out* to localhost; it only stops reading the response. But POST requests for state-changing actions (post comment, submit review) don't need a readable response to cause damage. Additionally, DNS rebinding can defeat simple origin checks by resolving an attacker-controlled hostname to 127.0.0.1 after the initial page load.

**How to avoid:**
Bind to `127.0.0.1` *only* (not `0.0.0.0`). Require a per-session token passed in a custom header on every request (token generated at server startup, injected into the opened browser page via the URL hash or a one-shot setup endpoint that sets a same-origin cookie — then cleared from URL). Validate the `Host` header strictly (`127.0.0.1:PORT` or `localhost:PORT`, nothing else) to block DNS rebinding. Enforce a strict CSP that prohibits cross-origin script/embed. Use `SameSite=Strict` on any session cookie.

**Warning signs:**
Server accepts requests with missing/wrong session token; `Host: evil.com:PORT` requests get 200s; curl from a different origin without the token succeeds; server listens on `0.0.0.0`.

**Phase to address:**
Local web server / plugin bootstrap phase — security model must ship with the very first end-to-end version, not be bolted on later.

**Severity:** BLOCKER. "Personal tool" is not a defense; the author's browser routinely visits untrusted sites.

---

### Pitfall 7: MCP tool blocks the LLM turn past the client-side timeout

**What goes wrong:**
A tool like `fetch_pr_diff` takes 90 seconds on a large PR (GitHub API pagination + rate limit sleeps). The Claude Code MCP client has a hardcoded ~60s request timeout; the tool result is silently dropped, the LLM sees "no result received" or a generic error, and the user watches the session stall with no recovery.

**Why it happens:**
MCP client timeouts are documented at ~60s (and often not user-configurable in Claude Code). Tools that touch the network on the critical path of a synchronous tool call are at risk. The issue is specifically documented for MCP tool execution in Claude Code / Claude Desktop.

**How to avoid:**
Make slow operations non-blocking by design. Long fetches (initial PR ingest, full diff load) happen *before* the MCP tool call returns — the plugin pre-loads PR state into a local store when `/review <url>` slash-command fires, so by the time the LLM calls `list_files()` the data is already in SQLite/memory. For any operation that might exceed ~30s, return an operation ID immediately and provide a `poll_operation(id)` tool the LLM can call. Avoid tools whose p99 latency is anywhere near 60s.

**Warning signs:**
Any MCP tool with p50 latency > 5s or p99 > 30s; "no result received" errors in Claude Code output; user-reported hangs during walkthrough; tools that wrap network round-trips without caching.

**Phase to address:**
MCP tool-design phase. Latency budget belongs in the tool-surface spec.

**Severity:** SERIOUS. Breaks the daily-driver feel even if functional.

---

### Pitfall 8: Browser refresh / close loses unposted comments

**What goes wrong:**
User is three hunks deep, has drafted four inline comments with the LLM, accidentally hits ⌘-R or closes the tab. Reopens — comments gone, walkthrough state gone. The PROJECT.md promises resumable state across browser close; a naive implementation (in-memory server state, `useState` in React, ephemeral websocket session) breaks this promise silently.

**Why it happens:**
It is natural to build the first version with all state in the MCP server process memory + React component state. The "persistence" thought happens later and gets punted as "a fix".

**How to avoid:**
Make persistence the default from the first end-to-end slice. Every state-changing action (draft comment, navigate hunk, tag severity, decide verdict) is an event appended to a per-PR event log on disk (SQLite or append-only JSONL). Browser refresh is a no-op: UI reads from server, server reads from disk. Write an acceptance test that kills and restarts the server mid-session and verifies comment drafts + walkthrough position resume.

**Warning signs:**
State lives in React state without a corresponding server write; websocket reconnect clears UI; "just reload the page" is part of any debug recipe; no `/session/:pr/restore` endpoint.

**Phase to address:**
Persistence phase — must be one of the earliest phases per PROJECT.md's explicit requirement. Do not ship a "working" walkthrough without it.

**Severity:** BLOCKER per PROJECT.md (explicit requirement). Would silently degrade from blocker to "annoying" if persistence were optional — it's not.

---

### Pitfall 9: Stale diff on resume after new commits / force-push

**What goes wrong:**
User starts a review Tuesday. Wednesday the PR author pushes 3 more commits (or force-pushes a rebase). User reopens the plugin Thursday to resume. The plugin loads the cached diff from Tuesday, the LLM walks through hunks that no longer exist on HEAD, comments get anchored to lines that have moved or disappeared, and the final `POST /reviews` either 422s or (worse) lands comments on wrong lines on the new diff.

**Why it happens:**
Persistence (Pitfall 8) done naively caches the diff forever. The plugin has no concept of "the PR moved under us". GitHub's own UI handles this by marking comments outdated, but a client submitting fresh comments has to detect staleness itself.

**How to avoid:**
On resume, fetch the current PR head SHA and compare to the stored SHA. If they differ: surface a clear "PR updated since last session" state with explicit choices — (a) rebase drafted comments onto the new diff where possible (re-match by hunk content hash), dropping orphaned comments with a visible notice; (b) discard the session and start over; (c) view both. Never silently submit old-diff-coordinates against new-diff HEAD. Store the SHA alongside every drafted comment and every walkthrough anchor.

**Warning signs:**
No `head_sha` field in the persisted session; resume never shows "PR updated" UI; comments drafted against old SHA get submitted against new SHA; anchor-rebase logic isn't tested against a force-push fixture.

**Phase to address:**
Resume / persistence phase, as a required sub-feature of persistence — not a later polish pass.

**Severity:** SERIOUS. Silently corrupts reviews when it hits; likely to hit within first week of daily use.

---

### Pitfall 10: Submitting duplicate reviews on resume

**What goes wrong:**
User submits a review. Something glitches (network blip, server restart, accidental re-run of submit). Plugin submits a second review with the same comments. The PR now shows two identical reviews from the author; real reviewers look unprofessional.

**Why it happens:**
`POST /repos/{owner}/{repo}/pulls/{pr}/reviews` is not idempotent. No natural dedup key. A naive "retry on error" wrapper or a "click submit again" UI allows duplicates. Separately: GitHub keeps pending reviews server-side keyed to the user — a previous aborted session can leave a pending review the next session doesn't know about, causing the `POST` with `comments: [...]` to interact oddly with pre-existing pending state.

**How to avoid:**
Maintain client-side submission state: `submitted | submitting | failed | not_yet`. Generate a local `submission_id` when the user clicks "Submit", persist it, and make the submit endpoint refuse to run if the state is already `submitted`. On startup/resume, query GitHub for the author's existing reviews on this PR; if one exists with a matching `submission_id` marker (embed the ID as an HTML comment in the review body) or identical body+SHA, treat as submitted. Also: detect and clear any pre-existing pending review (`DELETE /pulls/{n}/reviews/{id}`) before starting a new one, or explicitly resume it.

**Warning signs:**
Submit button is clickable twice; no persisted `submitted: true` flag per PR; no check for existing pending reviews at session start; identical review bodies appear twice on test PRs.

**Phase to address:**
Review-submission phase. Idempotency is a shipping requirement, not a hardening pass.

**Severity:** SERIOUS. Most visible public artifact of the tool misbehaving.

---

### Pitfall 11: LLM ignores PR description and reviews in a vacuum

**What goes wrong:**
The PR description says "refactor: extract payment validation into its own module, behavior unchanged". The LLM walkthrough treats every hunk as if it might contain new behavior, spends comments on "this validation is duplicated" (yes — that's what extraction looks like), and misses that a refactor should be checked for behavior-preservation rather than new-feature correctness.

**Why it happens:**
Many LLM review pipelines prompt "review this diff" without the metadata surrounding it. Author intent signals — PR title, description, linked issues, commit messages — are cheap context with high signal-to-token ratio that gets skipped.

**How to avoid:**
Ingest PR metadata (title, body, linked issue bodies if any) as part of the initial summary generation and persist it for every subsequent prompt. The summary tool output must reason explicitly: "Author states intent is X; the review lens is Y (bug-fix → regression check, refactor → behavior preservation, feature → correctness+tests)." Pass the intent classification into the self-review and walkthrough prompts as structured context, not free-text.

**Warning signs:**
Summary doesn't quote or paraphrase the PR description; review comments contradict stated intent without acknowledging it; refactor PRs get "this looks duplicated" comments; feature PRs don't check for tests.

**Phase to address:**
Summary / ingestion phase — early in the pipeline.

**Severity:** SERIOUS. Degrades review quality to "junior reviewer who didn't read the description".

---

### Pitfall 12: Mis-attribution — flagging pre-existing code as a new issue

**What goes wrong:**
The LLM comments on line 47: "this function has no null check". Line 47 was already there before this PR; the PR just touches line 48. The author now has to defend / explain code they didn't write in this PR, or worse, the "reviewer" (a posted GitHub review) makes unfounded accusations about pre-existing code.

**Why it happens:**
The LLM sees the "full file" context (or infers it) and doesn't distinguish "lines added/modified in this PR" from "context lines shown in the diff but unchanged". Unified diff format includes context lines specifically so reviewers *can* reason about surrounding code, but comments should generally anchor to *changed* lines only, or explicitly acknowledge when commenting on pre-existing code.

**How to avoid:**
Only changed lines (additions on `RIGHT`, deletions on `LEFT`) are valid anchor targets for new comments by default. The `post_comment` tool rejects anchors on context-only lines unless a `pre_existing: true` flag is passed, in which case the comment body is prefixed with "[pre-existing]" automatically. Include "don't flag issues that predate this PR unless they interact with this change" in the self-review prompt.

**Warning signs:**
Comments on lines with no `+`/`-` marker in the diff; author reactions like "this is from 2022"; comments that can't be expressed in terms of what changed.

**Phase to address:**
Walkthrough / comment-drafting phase. Schema-level enforcement via `post_comment`.

**Severity:** SERIOUS. Erodes reviewer credibility the moment the author pushes back.

---

### Pitfall 13: Over-engineering for teams when this is a solo tool

**What goes wrong:**
v1 grows user accounts, shared review templates, team checklists, a "publish your review profile" feature. Shipping date slips. Daily-driver value never materializes because the author is building platform features instead of the walkthrough loop.

**Why it happens:**
Habit. Most tooling we read about is team tooling; defaults imported from "how a real product works" creep into scope. PROJECT.md explicitly scopes this as personal but the gravity of "what if others want to use it" is constant.

**How to avoid:**
Every feature proposed during planning gets a "does this survive if literally one person uses this forever?" check. Hardcode defaults that a team tool would make configurable: paths, port range, browser choice, checklist location. Keep config surface at near zero — `.review/checklist.md` is the entire config story per PROJECT.md. Defer any abstraction (plugin system, template engine, theming) until a second concrete use case actually exists.

**Warning signs:**
Work on "config schema" before the walkthrough works end-to-end; abstractions with one implementation; settings screen in the UI; discussion of "how other users would..." in commit messages; scope additions justified by "future flexibility".

**Phase to address:**
Planning / roadmap phase itself — this is a meta-pitfall that shapes phase structure.

**Severity:** SERIOUS. Directly threatens the "ship to validate" strategy in PROJECT.md.

---

## Moderate Pitfalls

### Pitfall 14: Walkthrough ordering misses the "core change"

**What goes wrong:** LLM walks files alphabetically or by diff order, burying the 2 lines in `payment_processor.ts` that are the actual point of the PR under 200 lines of snapshot-test churn in `__snapshots__/`.

**Why:** Default sort is alphabetical or GitHub's file order, which has no notion of author intent.

**Avoid:** The walkthrough-ordering pass must score hunks on: (a) does the PR description mention this file? (b) test/snapshot/lockfile heuristic (deprioritize), (c) hunk size inverted (small changes in big files often carry intent), (d) touches function signatures / exports. Curated order is explicit LLM output, not emergent, and must be shown to the user before walkthrough starts with a "change this order?" affordance.

**Phase:** Walkthrough-curation phase.

**Severity:** MODERATE — user can hit "show all" and recover, but wastes time.

---

### Pitfall 15: Tool schema surface too large or ambiguously named

**What goes wrong:** The plugin exposes 20 MCP tools (`show_hunk`, `display_hunk`, `view_hunk`, `navigate_to_hunk`, `goto_hunk`, ...). LLM picks the wrong one, or picks a bad one, or the schema itself consumes a large chunk of context.

**Why:** Incremental feature addition without consolidation; tools named by implementation detail rather than intent.

**Avoid:** Target ≤ 10 MCP tools total. Each tool verb picks from a small set: `list_*`, `get_*`, `draft_*`, `submit_*`, `cancel_*`. No synonyms. Tool descriptions are action-framed ("Draft an inline comment on a specific line.") and include the one example that disambiguates from nearest neighbors. Review the tool list at each phase transition and merge any that could be one tool with a parameter.

**Phase:** MCP tool-schema design; re-check at every phase transition.

**Severity:** MODERATE.

---

### Pitfall 16: Port collisions on startup

**What goes wrong:** Plugin hardcodes port 3737; another process has it; plugin crashes or (worse) silently connects the browser to an unrelated service.

**Why:** Hardcoded port, no fallback.

**Avoid:** Request port 0 from the OS (ephemeral port assignment), capture the assigned port, use it in the browser-open URL. Reserve a preferred port (e.g. 27471) but fall through to ephemeral if busy. Never assume a port is free.

**Phase:** Bootstrap / server startup phase.

**Severity:** MODERATE — annoying, detectable immediately.

---

### Pitfall 17: `gh` CLI auth vs Octokit token mismatch

**What goes wrong:** User is authenticated with `gh` as `crnbarr` but `GITHUB_TOKEN` env var points to an old PAT for a different account; plugin uses Octokit with the env var and posts a review from the wrong identity or 401s intermittently.

**Why:** Two parallel auth surfaces on one machine; ordering of "which token wins" is underspecified.

**Avoid:** Single documented auth precedence: `gh auth token` first (shells out), env `GITHUB_TOKEN` as explicit fallback, fail loudly if both exist and disagree on the `/user` lookup. Show the detected username in the plugin's startup banner / UI header so mis-identity is visible.

**Phase:** GitHub integration phase.

**Severity:** MODERATE.

---

### Pitfall 18: "Show all" escape re-anchoring walkthrough state

**What goes wrong:** User is on curated step 3 of 5, clicks "Show all", sees full hunk list, then tries to "go back" to the curated walkthrough — position is lost, self-review checkmarks reset, drafted comments may re-appear or disappear.

**Why:** Curated and full modes are treated as distinct state trees rather than two projections of one underlying walkthrough pointer.

**Avoid:** Model walkthrough state as a single ordered list of hunks with a `curated: true` flag per hunk. "Show all" is a filter toggle in the UI, not a state reset. Current pointer is always on a hunk; filter changes what's visible but never what's current.

**Phase:** Walkthrough feature phase.

**Severity:** MODERATE.

---

### Pitfall 19: User-LLM comment thread doesn't map to one GitHub comment

**What goes wrong:** During walkthrough, user and LLM have a 6-turn back-and-forth about a line. What gets posted to GitHub? All 6 turns as one comment? Only the last LLM message? Only the synthesized conclusion?

**Why:** GitHub's inline comment model is "one comment body per post"; the plugin's in-review thread model is conversational. There's no obvious serialization.

**Avoid:** Every inline thread has a designated "posted comment body" slot that is explicitly either (a) LLM-synthesized summary of the thread, generated on demand and shown to the user for editing before lock-in, or (b) user-chosen single message. The conversation itself is a drafting aid, not content; this must be obvious in the UI. Never auto-concatenate the whole thread into the posted body.

**Phase:** Comment-drafting / conversation phase.

**Severity:** MODERATE — affects output quality.

---

### Pitfall 20: Verdict forced before user has walked enough

**What goes wrong:** Submit button is always enabled. User clicks submit after step 1 of 12 by accident (or because the UI doesn't make walkthrough progress salient). Review posted with verdict chosen under false confidence.

**Why:** Trivial to implement "submit always works"; progress-gating requires thought.

**Avoid:** Submit is gated on either (a) walkthrough completion or (b) explicit "submit early anyway" confirmation that requires typing the verdict. Show walkthrough progress (`3 of 12 core changes reviewed`) prominently next to the submit control. Default verdict resolves from the self-review, and is re-evaluated based on what the walkthrough surfaces.

**Phase:** Review-submission phase.

**Severity:** MODERATE.

---

## Minor Pitfalls

### Pitfall 21: Browser opens with stale cached JS after plugin update

**What goes wrong:** Plugin updates, browser has previous bundle cached, user sees old UI / new server API mismatch.

**Avoid:** Cache-bust static assets with a build hash in filename; serve `index.html` with `Cache-Control: no-store`.

**Phase:** Bootstrap / build-tooling phase.

**Severity:** MINOR.

---

### Pitfall 22: Rate limits on large PRs (pagination)

**What goes wrong:** PR has 300 files; naive single `pulls/{n}/files` call returns 30 per page; plugin fetches one page and calls it done.

**Avoid:** Always paginate (Octokit's `.paginate()` helper or GraphQL with cursors). Concurrency limit to respect secondary rate limits. Cache results for the session.

**Phase:** GitHub integration phase.

**Severity:** MINOR for personal use — author's PRs are usually normal-sized.

---

### Pitfall 23: Bikeshedding the UI instead of review quality

**What goes wrong:** Three weeks on the diff renderer's typography and syntax theme; walkthrough loop still doesn't work end to end.

**Avoid:** Phase ordering puts "LLM review produces correct output posted to GitHub" strictly before "diff view is pretty". Lean on an existing diff-render library (e.g. `diff2html`, `react-diff-view`) for v1 — don't build from scratch. Ship default system fonts. Polish later.

**Phase:** Meta — enforced by roadmap phase structure.

**Severity:** MINOR in isolation, SERIOUS as a pattern if it repeats.

---

### Pitfall 24: Skipping tests because "it's personal"

**What goes wrong:** A regression in comment-anchor logic ships, silently corrupts a review on a real PR, author loses trust in the tool, reverts to Claude desktop app.

**Avoid:** Minimum test floor: the comment-posting path, the persistence/resume path, the force-push detection path, and the coordinate-mapping adapter (Pitfall 1). Everything else can skip tests. These four are where silent corruption hides.

**Phase:** Every phase that touches those paths.

**Severity:** MINOR-to-MODERATE — low probability, high blast radius when it hits.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip pagination, fetch one page of PR files | Fewer API calls in test PRs | Silently drops files on any 31+ file PR | Never — single extra line of Octokit |
| Use `position` instead of `line`/`side` | Matches older examples | GitHub deprecating; off-by-N bugs; inconsistent with GraphQL | Never |
| Store review state in memory only | Skip SQLite setup | Violates explicit PROJECT.md requirement; first refresh kills state | Only in a throwaway prototype spike before the real phase |
| Hardcode port | One line vs ephemeral | Collisions; re-use conflicts | MVP acceptable if paired with clear error on collision |
| Let LLM pass `(path, line)` strings directly to post_comment | Simpler schema | Hallucinated coordinates ship to GitHub | Never |
| Return whole diff in one tool response | Simpler MCP surface | Context exhaustion on real PRs | Never — but a 2k-token threshold covers small PRs naturally |
| Skip integration test against real GitHub API | Faster CI | Diff-coordinate bugs are invisible without it | Never for the review-submission code path |
| Treat curated walkthrough and "show all" as separate state | Easier initial impl | State-sync bugs on toggle | Never — one state tree from the start |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub REST `POST /pulls/{n}/reviews` | Using `position` for comments, or mixing `position` and `line` | Exclusively `line` + `side` (+ `start_line`/`start_side` for multi-line); one internal `Anchor` type; single adapter |
| GitHub pending-review state | Not checking for existing pending review at session start | `GET /pulls/{n}/reviews?state=PENDING` filtered by author at startup; either adopt or `DELETE` before creating new |
| Octokit auth | Assuming `process.env.GITHUB_TOKEN` is canonical | Prefer `gh auth token`; fail loudly on disagreement; display identity in UI |
| MCP tool response size | Returning full diff blob | Paginate via IDs; ≤ 2k tokens per response; resources for large artifacts |
| MCP tool timeouts | Long network work on tool critical path | Pre-fetch on slash-command boot; async + poll for anything > 30s |
| GraphQL vs REST for reviews | Using `addPullRequestReview` mutation with wrong thread-comment shape | REST `POST /pulls/{n}/reviews` is simpler and documented; reserve GraphQL for batch multi-line reads |
| Force-push detection | Comparing branch name, not head SHA | Persist head SHA per session; compare on resume |
| Browser + local server | Accepting any Host header / any Origin | Strict Host validation; per-session token; CSP |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Syntax highlighting on main thread | UI freezes when loading a 1000+ line file; scroll stutters | Highlight in a Web Worker; virtualize hunk rendering; highlight only visible viewport + lookahead | ~500 lines of highlighted code in a single view |
| Full-diff rendering without virtualization | Initial page load seconds long; memory spikes | Render visible hunks only; lazy-load file contents; use `react-window` or similar for hunk lists | ~2000-line diff |
| Re-rendering all comments on every state change | Typing in a comment lags | Keyed rendering; memoize comment components by `(commentId, version)` | ~50 drafted comments |
| Synchronous full-diff fetch on startup | Slash command feels slow; LLM sees no data for 10s | Fetch in background after UI boot; progressive tool responses | Any PR with remote network fetch |
| Full diff in LLM context per tool call | Context budget exhausted before review even starts | Hunk-paginated MCP tools (Pitfall 5) | ~5 hunks in |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Bind server to `0.0.0.0` | Anyone on LAN hits the server | Bind to `127.0.0.1` only |
| No per-session auth token | CSRF/DNS-rebinding from visited websites can post reviews | Random token per launch, required in header, same-origin cookie scope |
| No Host-header validation | DNS rebinding defeats origin checks | Allowlist `localhost:PORT` and `127.0.0.1:PORT` exactly |
| Permissive CSP | XSS via malformed PR content pops server | Strict CSP; escape all diff/comment content; `default-src 'self'` |
| Logging raw PR contents indefinitely | Any future PR with secrets leaks to logs | Log paths + hashes, never diff content; rotate/delete on session end |
| Embedding GitHub token in browser bundle | Token accessible via devtools / XSS | Token lives only in the server process; browser asks server to perform actions |
| Storing tokens in plain localStorage | `javascript:` URL or XSS exfiltrates | Server-side session; `httpOnly` cookie if anything at all |
| No verification of which account is active | User posts review as wrong identity | Display authenticated GitHub user in UI header on boot |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Submit button always enabled | Accidental premature reviews | Gate on walkthrough completion or explicit confirmation |
| No indication of pending comments on close | Lost work, mistrust | "You have N unsent comments" banner; autosave indicator |
| Walkthrough progress invisible | User doesn't know when they're done | Persistent `X of Y core changes` progress UI |
| "Show all" resets walkthrough state | User avoids the escape hatch | Filter toggle, not state reset |
| Verdict defaults to Approve | Rubber-stamp reviews | Default "Request changes" from the self-review; LLM argues down |
| Inline thread posted verbatim | Noisy reviews | Synthesized post-body slot, editable |
| No visible session identity | Review posted from wrong account | Show authenticated user in the UI chrome |
| Stale-diff silent submission | Broken comments on HEAD | Force "PR updated" modal with rebase/discard/view-both choices |

## "Looks Done But Isn't" Checklist

- [ ] **Post inline comment:** Often missing line-vs-position correctness — verify by reading back the posted comment via the API and asserting the line number
- [ ] **Submit review:** Often missing idempotency — verify by clicking submit twice and confirming only one review exists on the PR
- [ ] **Resume after close:** Often missing drafted-comment restoration — verify by drafting, closing the browser, reopening, and confirming the comment is still there
- [ ] **Resume after force-push:** Often missing stale-SHA detection — verify by force-pushing the fixture branch between sessions and confirming the UI surfaces it
- [ ] **Walkthrough ordering:** Often missing intent-aware sort — verify that a PR titled "fix: X" prioritizes the file containing the fix over snapshot churn
- [ ] **Self-review:** Often missing adversarial stance — verify the default verdict on a genuinely-buggy fixture PR is not Approve
- [ ] **Large PR:** Often missing tool-response pagination — verify on a 500-line-diff PR that no single MCP tool response exceeds the token threshold
- [ ] **Pre-existing code:** Often missing context-line guard — verify comments reject anchoring to unchanged context lines
- [ ] **Local server security:** Often missing Host validation — verify `curl -H 'Host: evil.com:PORT'` gets rejected
- [ ] **Auth identity:** Often missing identity display — verify UI shows the authenticated GitHub user
- [ ] **Port in use:** Often missing fallback — verify the plugin still boots when the preferred port is occupied
- [ ] **Duplicate submission:** Often missing submitted-state persistence — verify a re-run of submit after a successful submit refuses to post

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong-line comments shipped to a real PR | LOW | Delete individual review comments via API; re-post correctly; fix adapter + test |
| Duplicate review submitted | LOW | `DELETE /pulls/{n}/reviews/{id}` on the duplicate; add idempotency guard before next session |
| Unposted comments lost on browser close | LOW-MEDIUM | Ship persistence layer before next session; accept one-session data loss |
| Stale diff comments posted on new HEAD | MEDIUM | Delete offending comments; add SHA-gate; ship force-push detection |
| Localhost server abuse via a visited site | HIGH | Ship token + Host validation immediately; rotate `gh` token if anything state-changing happened |
| Review quality regression from flood of nits | LOW | Adjust severity gating in prompt; cap nits; re-review the PR |
| Context window blown mid-review | LOW | Restart review session; ship hunk-pagination |
| Mis-identity review posted | MEDIUM | Delete review via API; reconcile `gh` / env token; add identity display |

## Pitfall-to-Phase Mapping

Exact phase names will be set by the roadmap, but these are the logical groupings:

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. `position` vs `line`/`side` | GitHub-integration / review-submission phase | Integration test against fixture PR reads comment back and asserts line |
| 2. Hallucinated coords in `post_comment` | MCP tool-schema phase | Schema rejects non-ID anchors; unit test feeds garbage IDs and expects 400 |
| 3. Nitpick flood | Self-review + checklist phase | Fixture with one real bug + cosmetic issues; assert review has ≤ N nits |
| 4. Sycophantic self-review | Self-review phase | Buggy fixture PR → default verdict is "Request changes" |
| 5. Context exhaustion | MCP tool-schema phase | Response size test on 5k-line diff PR; no response > 2k tokens |
| 6. DNS rebinding / CSRF | Server bootstrap phase | Curl Host-header test; missing-token test; both must reject |
| 7. MCP tool timeout | MCP tool-schema phase | Any tool p99 over 10s triggers a test failure |
| 8. Persistence lost on close | Persistence phase (early) | Kill-and-restart test with drafted comments |
| 9. Stale diff on resume | Persistence phase (early) | Force-push fixture test; UI surfaces "PR updated" |
| 10. Duplicate submission | Review-submission phase | Submit-twice test asserts one review exists |
| 11. LLM ignores PR description | Summary / ingestion phase | Summary prompt-output includes paraphrased intent |
| 12. Pre-existing code mis-attribution | Walkthrough / comment-drafting phase | `post_comment` rejects context-line anchors without explicit flag |
| 13. Over-engineering for teams | Planning / every phase transition | Phase review question: "does this survive with one user?" |
| 14. Walkthrough ordering | Walkthrough-curation phase | Fixture with snapshot + core-change hunks; core-change ranked first |
| 15. Tool schema bloat | MCP tool-schema phase; re-checked each transition | Tool count cap (≤ 10); phase-transition review |
| 16. Port collisions | Bootstrap phase | Start-with-port-occupied test |
| 17. Auth mismatch | GitHub-integration phase | Dual-token test asserts precedence + visible identity |
| 18. "Show all" re-anchor | Walkthrough phase | Toggle-filter test preserves current hunk |
| 19. Thread vs single comment | Comment-drafting phase | Explicit "post body" slot in UI; thread not auto-concatenated |
| 20. Verdict forced early | Review-submission phase | Submit-before-walkthrough-complete requires explicit confirmation |
| 21. Stale browser cache | Bootstrap / build tooling | Hashed asset names; `no-store` on index |
| 22. Rate-limit pagination | GitHub-integration phase | Paginated fetch against 100+ file fixture |
| 23. UI bikeshedding | Meta / roadmap ordering | Roadmap enforces functional-first phase order |
| 24. Skipped tests on critical paths | Every phase touching those paths | Mandatory tests for the four critical paths |

## Sources

- [REST API endpoints for pull request review comments — GitHub Docs](https://docs.github.com/en/rest/pulls/comments) — authoritative on `position` vs `line`/`side` semantics (HIGH confidence)
- [REST API endpoints for pull request reviews — GitHub Docs](https://docs.github.com/en/rest/pulls/reviews) — review submission shape (HIGH)
- [`position` marked necessary in `createReview` while it's not — octokit/plugin-rest-endpoint-methods.js#614](https://github.com/octokit/plugin-rest-endpoint-methods.js/issues/614) — Octokit-specific coordinate gotcha (MEDIUM)
- [LLM Hallucinations in AI Code Review — diffray](https://diffray.ai/blog/llm-hallucinations-code-review/) — line-number hallucination rates and mitigations (MEDIUM)
- [Drowning in AI Code Review Noise — Jet Xu's Engineering Blog](https://jetxu-llm.github.io/posts/low-noise-code-review/) — signal-to-noise framework + 22k-comment study (MEDIUM)
- [Why AI Code Review Overwhelms Developers — Codeant](https://www.codeant.ai/blogs/prevent-ai-code-review-overload) — 70-90% ignored comment data (MEDIUM)
- [DNS Rebinding and Localhost MCP — Rafter](https://rafter.so/blog/mcp-dns-rebinding-localhost) — direct coverage of the MCP+localhost attack surface (HIGH)
- [Your Dev Server Is Not Safe: CSRF on Localhost — InstaTunnel](https://instatunnel.my/blog/-your-dev-server-is-not-safe-the-hidden-danger-of-csrf-on-localhost) — localhost CSRF mechanics (MEDIUM)
- [0.0.0.0 Day: Exploiting Localhost APIs From the Browser — Oligo Security](https://www.oligo.security/blog/0-0-0-0-day-exploiting-localhost-apis-from-the-browser) — 0.0.0.0 binding specifically (HIGH)
- [MCP_TOOL_TIMEOUT not respected for long-running HTTP tool calls — anthropics/claude-code#17662](https://github.com/anthropics/claude-code/issues/17662) — concrete timeout behavior in Claude Code (HIGH)
- [Response size limit for MCP responses — modelcontextprotocol#2211](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2211) — response-size ceilings (HIGH)
- [10 strategies to reduce MCP token bloat — The New Stack](https://thenewstack.io/how-to-reduce-mcp-token-bloat/) — tool-surface sizing (MEDIUM)
- [Force push a branch without losing review comments — Image.sc Forum](https://forum.image.sc/t/force-push-a-branch-without-losing-review-comments/1009) + [File comments outdated on push — GitHub community #86527](https://github.com/orgs/community/discussions/86527) — force-push semantics (MEDIUM)
- [Use web workers to run JavaScript off the main thread — web.dev](https://web.dev/articles/off-main-thread) — syntax highlighting / heavy work off main thread (HIGH)
- [Hallucinations in code are the least dangerous form of LLM mistakes — Simon Willison](https://simonwillison.net/2025/Mar/2/hallucinations-in-code/) — general grounding on LLM code-hallucination character (MEDIUM)
- Project context: `.planning/PROJECT.md` — the single-user scope, MCP driver, persistence-on-disk, GitHub+local-branch-only constraints that shape severity ratings

---
*Pitfalls research for: Claude Code plugin for LLM-assisted GitHub PR review with local web GUI*
*Researched: 2026-04-16*
