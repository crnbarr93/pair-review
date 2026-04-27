---
description: Open a PR review workspace with bidirectional collaboration
argument-hint: <pr-url-or-number> | --local <base> <head> [--dry]
allowed-tools: mcp__git-review-plugin__start_review, mcp__git-review-plugin__set_pr_summary, mcp__git-review-plugin__set_walkthrough, mcp__git-review-plugin__run_self_review, mcp__git-review-plugin__list_files, mcp__git-review-plugin__get_hunk, mcp__git-review-plugin__reply_in_thread, mcp__git-review-plugin__draft_comment, mcp__git-review-plugin__resolve_thread, mcp__git-review-plugin__submit_review, mcp__git-review-plugin__await_user_request, mcp__git-review-plugin__respond_chat
---

## SOURCE ARGUMENT PARSING

Parse $ARGUMENTS to determine the review source. Strip "--dry" from $ARGUMENTS before building the source argument. Build the source using exactly one of these shapes:

- `{ "source": { "kind": "github", "url": "<full-PR-URL>" } }` — when the input (minus --dry) is a full GitHub PR URL like `https://github.com/owner/repo/pull/123`.
- `{ "source": { "kind": "github", "number": <integer> } }` — when the input (minus --dry) is just a PR number (the tool infers owner/repo from the current working directory's git remote).
- `{ "source": { "kind": "local", "base": "<ref>", "head": "<ref>" } }` — when the input contains `--local <base> <head>` (e.g. `--local HEAD~1 HEAD` or `--local main feature/x`).

## STARTUP SEQUENCE

**Step 1 — Parse flags:** Check whether $ARGUMENTS contains `--dry`. If it does, set DRY=true. Otherwise DRY=false.

**Step 2 — Start session:** Call `start_review` with the source argument built above. Note the returned text — it contains the PR title, source descriptor, paraphrased description, and the local review URL. Parse the flags at the end of the response: `has_summary: true`, `has_walkthrough: true`, `has_selfReview: true` — these indicate the session was resumed from a previous run and already has these artifacts.

**DO NOT** share the URL with the user yet — you will share it after auto-generation completes (Step 6).

## AUTO-GENERATION (Steps 3–5)

**These steps are MANDATORY unless DRY=true. You MUST execute each step sequentially before entering the listen loop. Do not skip them. Do not jump ahead to the listen loop.**

**Step 3 — Generate PR summary (skip ONLY if DRY=true OR `has_summary: true`):** Call `respond_chat` with "Generating PR summary..." so the user sees activity. Then call `set_pr_summary` to generate the PR intent, key changes, and risk areas. After it completes, call `respond_chat` with a brief message like "Summary generated — click the Summary step above to view intent, key changes, and risk areas."

**Step 4 — Generate walkthrough (skip ONLY if DRY=true OR `has_walkthrough: true`):** Call `respond_chat` with "Building walkthrough..." so the user sees activity. Then call `set_walkthrough` to build the step-by-step walkthrough narrative. After it completes, call `respond_chat` with a brief message like "Walkthrough ready — N steps covering the core changes. Click the Walkthrough step or use Next step to navigate."

**Step 5 — Run self-review (skip ONLY if DRY=true OR `has_selfReview: true`):** Call `respond_chat` with "Running self-review..." so the user sees activity. Then call `list_files` and `get_hunk` as needed to gather the diff context required by `run_self_review`. Then call `run_self_review` with your findings, coverage assessment, and verdict. After it completes, call `respond_chat` with a summary like "Self-review complete — N findings (X blockers, Y major, Z minor). Check the Findings sidebar."

**Step 6 — Report to user:** Share the review URL from Step 2 with the user. Include a brief status: which artifacts were generated (summary, walkthrough, self-review) and that the review workspace is ready. Example: "Review workspace ready at <URL>. Generated summary, walkthrough (N steps), and self-review (N findings). Listening for your requests."

**Step 7:** Enter the LISTEN LOOP immediately.

## LISTEN LOOP

**Step 8:** Call `await_user_request`. This blocks until the browser sends a request or a ~5-minute timeout fires.

**Step 9:** Process the returned payload based on its `type` field:

- `type: "no_request"` — The timeout fired with no user request. Call `await_user_request` again immediately. Do not pause, do not comment. Just loop.
- `type: "chat"` — The user sent a chat message. Read `payload.message`. Formulate a relevant response (drawing on the PR diff and context). Call `respond_chat` with your answer. Then call `await_user_request` again.
- `type: "inline_comment"` — The user started a thread on a diff line and tagged @claude. Read `payload.lineId`, `payload.message`, and `payload.threadId`. Call `reply_in_thread` with the lineId and your response. Call `draft_comment` when you have synthesized a formal comment for the review. Then call `await_user_request` again.
- `type: "run_self_review"` — The user requested the self-review checklist. Call `respond_chat` with "Running self-review..." first. Then call `run_self_review`. After it completes, call `respond_chat` with a summary like "Self-review complete — N findings (X blockers, Y major, Z minor). Check the Findings sidebar." Then call `await_user_request` again.
- `type: "regenerate_summary"` — The user requested a fresh PR summary. Call `respond_chat` with "Regenerating summary..." first. Then call `set_pr_summary`. After it completes, call `respond_chat` with "Summary regenerated — click the Summary step to view." Then call `await_user_request` again.
- `type: "regenerate_walkthrough"` — The user requested a fresh walkthrough. Call `respond_chat` with "Rebuilding walkthrough..." first. Then call `set_walkthrough`. After it completes, call `respond_chat` with "Walkthrough rebuilt — N steps. Click the Walkthrough step to navigate." Then call `await_user_request` again.

**Step 10:** After processing ANY request type (except `no_request`, which already loops back in Step 9), call `await_user_request` again.

## CRITICAL LOOP DISCIPLINE

**You MUST continue calling `await_user_request` indefinitely. Never decide the loop is "done." Never stop after a chat exchange, after a self-review, after processing any number of requests. There is no natural end to this session — it ends only when the user explicitly closes the review or ends the Claude Code session. If you stop calling `await_user_request`, the user loses the ability to interact with you from the browser and must restart the session. Do not let that happen.**

User input: $ARGUMENTS
