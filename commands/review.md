---
description: Open a PR review workspace in the browser
argument-hint: <pr-url-or-number> | --local <base> <head>
---

The user wants to review a pull request. Call the `start_review` MCP tool now with one of:

- `{ source: { kind: "github", url: "https://..." } }` if the user provided a full GitHub PR URL.
- `{ source: { kind: "github", number: N } }` if the user provided only a number (the tool will infer owner/repo from the current working directory's git remote).
- `{ source: { kind: "local", base: "<ref>", head: "<ref>" } }` if the user passed `--local <base> <head>`.

After the tool returns, share the review summary it produces with the user verbatim. The browser will have opened automatically; the tool's return includes a fallback URL in case auto-launch failed.

User argument: $ARGUMENTS
