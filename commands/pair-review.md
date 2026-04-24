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

**Step 1:** Check whether $ARGUMENTS contains `--dry`. If it does, set a dry-run flag and skip Steps 3 and 4.

**Step 2:** Call `start_review` with the source argument built above. Share its `summary` field with the user verbatim — it contains the PR title, source descriptor, paraphrased description, and the local review URL. Do NOT add your own analysis of the diff. Check the returned text for `has_summary: true` and `has_walkthrough: true` flags — these indicate the session was resumed from a previous run and already has these artifacts.

**Step 3 (skip if --dry OR if start_review returned `has_summary: true`):** Call `set_pr_summary` to generate the PR intent, key changes, and risk areas. This auto-generates the summary panel in the browser.

**Step 4 (skip if --dry OR if start_review returned `has_walkthrough: true`):** Call `set_walkthrough` to build the step-by-step walkthrough narrative. This auto-generates the walkthrough banner in the browser.

**Step 5:** Enter the LISTEN LOOP immediately after startup completes (after Step 4, or after Step 2 if --dry).

## LISTEN LOOP

**Step 6:** Call `await_user_request`. This blocks until the browser sends a request or a ~5-minute timeout fires.

**Step 7:** Process the returned payload based on its `type` field:

- `type: "no_request"` — The timeout fired with no user request. Call `await_user_request` again immediately. Do not pause, do not comment. Just loop.
- `type: "chat"` — The user sent a chat message. Read `payload.message`. Formulate a relevant response (drawing on the PR diff and context). Call `respond_chat` with your answer. Then call `await_user_request` again.
- `type: "inline_comment"` — The user started a thread on a diff line and tagged @claude. Read `payload.lineId`, `payload.message`, and `payload.threadId`. Call `reply_in_thread` with the lineId and your response. Call `draft_comment` when you have synthesized a formal comment for the review. Then call `await_user_request` again.
- `type: "run_self_review"` — The user requested the self-review checklist. Call `run_self_review`. Then call `await_user_request` again.
- `type: "regenerate_summary"` — The user requested a fresh PR summary. Call `set_pr_summary`. Then call `await_user_request` again.
- `type: "regenerate_walkthrough"` — The user requested a fresh walkthrough. Call `set_walkthrough`. Then call `await_user_request` again.

**Step 8:** After processing ANY request type (except `no_request`, which already loops back in Step 7), call `await_user_request` again.

## CRITICAL LOOP DISCIPLINE

**You MUST continue calling `await_user_request` indefinitely. Never decide the loop is "done." Never stop after a chat exchange, after a self-review, after processing any number of requests. There is no natural end to this session — it ends only when the user explicitly closes the review or ends the Claude Code session. If you stop calling `await_user_request`, the user loses the ability to interact with you from the browser and must restart the session. Do not let that happen.**

User input: $ARGUMENTS
