---
description: Resume listening for user requests from the browser UI
allowed-tools: mcp__git-review-plugin__await_user_request, mcp__git-review-plugin__respond_chat, mcp__git-review-plugin__reply_in_thread, mcp__git-review-plugin__draft_comment, mcp__git-review-plugin__resolve_thread, mcp__git-review-plugin__set_pr_summary, mcp__git-review-plugin__set_walkthrough, mcp__git-review-plugin__run_self_review, mcp__git-review-plugin__submit_review, mcp__git-review-plugin__list_files, mcp__git-review-plugin__get_hunk
---

Re-enter the listen loop for an active review session. Use this when the LLM stopped responding to browser requests (e.g. after a context reset or accidental loop exit).

## LISTEN LOOP

**Step 1:** Call `await_user_request`. This blocks until the browser sends a request or a ~5-minute timeout fires.

**Step 2:** Process the returned payload based on its `type` field:

- `type: "no_request"` — The timeout fired with no user request. Call `await_user_request` again immediately. Do not pause, do not comment. Just loop.
- `type: "chat"` — The user sent a chat message. Read `payload.message`. Formulate a relevant response (drawing on the PR diff and context). Call `respond_chat` with your answer. Then call `await_user_request` again.
- `type: "inline_comment"` — The user started a thread on a diff line and tagged @claude. Read `payload.lineId`, `payload.message`, and `payload.threadId`. Call `reply_in_thread` with the lineId and your response. Call `draft_comment` when you have synthesized a formal comment for the review. Then call `await_user_request` again.
- `type: "run_self_review"` — The user requested the self-review checklist. Call `respond_chat` with "Running self-review..." first. Then call `run_self_review`. After it completes, call `respond_chat` with a summary like "Self-review complete — N findings (X blockers, Y major, Z minor). Check the Findings sidebar." Then call `await_user_request` again.
- `type: "regenerate_summary"` — The user requested a fresh PR summary. Call `respond_chat` with "Regenerating summary..." first. Then call `set_pr_summary`. After it completes, call `respond_chat` with "Summary regenerated — click the Summary step to view." Then call `await_user_request` again.
- `type: "regenerate_walkthrough"` — The user requested a fresh walkthrough. Call `respond_chat` with "Rebuilding walkthrough..." first. Then call `set_walkthrough`. After it completes, call `respond_chat` with "Walkthrough rebuilt — N steps. Click the Walkthrough step to navigate." Then call `await_user_request` again.

**Step 3:** After processing ANY request type (except `no_request`, which already loops back in Step 2), call `await_user_request` again.

## CRITICAL LOOP DISCIPLINE

**You MUST continue calling `await_user_request` indefinitely. Never decide the loop is "done." Never stop after a chat exchange, after a self-review, after processing any number of requests. There is no natural end to this session — it ends only when the user explicitly closes the review or ends the Claude Code session. If you stop calling `await_user_request`, the user loses the ability to interact with you from the browser and must restart the session. Do not let that happen.**

User input: $ARGUMENTS
