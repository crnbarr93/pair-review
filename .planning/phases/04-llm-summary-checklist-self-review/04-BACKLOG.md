---
phase: "04"
type: backlog
---

## Deferred Items

### Browser → Claude Code reverse channel (Phase 5)
- **What:** UI button that triggers Claude to run `set_pr_summary` + `run_self_review` without requiring the user to ask in the Claude Code terminal
- **Why deferred:** Requires a reverse channel (browser → server → MCP → Claude Code session) that doesn't exist yet. Phase 5's walkthrough flow needs this same signaling pattern, so it should be built there.
- **Approach:** HTTP POST `/api/session/request-review` sets a flag → MCP tool `check_pending_actions` lets Claude poll for it → auto-triggers the review tools
- **User request:** "Can we add a button to prompt Claude for a summary review instead of having to ask in the Claude session directly?"

### Dev mode (`--dev` / `REVIEW_DEV=1`) polish
- **What:** The `--dev` flag spawns Vite alongside Hono but has orphan-process and port-mismatch issues
- **Why deferred:** Functional but rough edges — multiple Vite processes, proxy port hardcoding
- **Fix:** Use a single dev orchestrator or fix the Vite child lifecycle management
