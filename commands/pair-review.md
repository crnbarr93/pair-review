---
description: Open a PR review workspace in the browser
argument-hint: <pr-url-or-number> | --local <base> <head>
allowed-tools: mcp__git-review-plugin__start_review
---

You MUST call the `mcp__git-review-plugin__start_review` tool. Do not attempt to perform a code review yourself — this command's entire purpose is to launch the local browser-based review workspace via that MCP tool. The tool reads the diff, parses hunks, persists state, and opens the default browser to a local review URL.

Build the tool argument from the user input below using exactly one of these shapes:

- `{ "source": { "kind": "github", "url": "<full-PR-URL>" } }` — when the input is a full GitHub PR URL like `https://github.com/owner/repo/pull/123`.
- `{ "source": { "kind": "github", "number": <integer> } }` — when the input is just a PR number (the tool will infer owner/repo from the current working directory's git remote).
- `{ "source": { "kind": "local", "base": "<ref>", "head": "<ref>" } }` — when the input is `--local <base> <head>` (e.g. `--local HEAD~1 HEAD` or `--local main feature/x`).

After the tool returns, share its `summary` field with the user verbatim — it contains the PR title, source descriptor, paraphrased description, and the local review URL. Do NOT add your own analysis of the diff; the user reviews the code in the browser, not in chat.

User input: $ARGUMENTS
