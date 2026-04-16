---
phase: 1
slug: plugin-skeleton-secure-vertical-slice
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (planned — Wave 0 installs in server/ and web/ workspaces) |
| **Config file** | `server/vitest.config.ts`, `web/vitest.config.ts` (Wave 0) |
| **Quick run command** | `pnpm -w vitest run --changed` |
| **Full suite command** | `pnpm -w test && pnpm -w build && ./scripts/security-probes.sh` |
| **Estimated runtime** | ~30s quick, ~90s full |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -w vitest run --changed`
- **After every plan wave:** Run `pnpm -w test && pnpm -w build`
- **Before `/gsd-verify-work`:** Full suite must be green AND `./scripts/security-probes.sh` must exit 0
- **Max feedback latency:** 30s quick cycle, 90s full cycle

---

## Per-Task Verification Map

> Populated by gsd-planner in step 8 as plans are authored. Each task MUST map to one row here or be flagged `⚠️ manual` with justification in the Manual-Only Verifications table below. Rows below are the requirement-level targets the planner must satisfy.

| Req | Wave | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-----|------|-----------------|-----------|-------------------|-------------|--------|
| PLUG-01 (commands) | 1 | `/review` and `/review --local` commands registered and executable inside Claude Code | integration | `pnpm -w vitest run commands/` | ❌ W0 | ⬜ pending |
| PLUG-02 (server boot) | 1 | MCP stdio + Hono HTTP co-process boot and tear down cleanly on SIGTERM | unit | `pnpm -w vitest run server/lifecycle.test.ts` | ❌ W0 | ⬜ pending |
| PLUG-03 (browser launch) | 1–2 | Default-browser opens to `http://127.0.0.1:<port>/#token=<64-bit>`; on launch failure the URL is printed to stdout and the command exits 0 with advisory | unit + manual | `pnpm -w vitest run server/launch.test.ts` (unit) + manual run | ❌ W0 | ⬜ pending |
| INGEST-01 (GitHub) | 2 | `gh pr view` + `gh pr diff` ingestion produces a `DiffModel` with file/hunk/line opaque IDs | unit | `pnpm -w vitest run ingest/github.test.ts` | ❌ W0 | ⬜ pending |
| INGEST-02 (local) | 2 | `git diff base...head` ingestion produces the same `DiffModel` shape as GitHub | unit | `pnpm -w vitest run ingest/local.test.ts` | ❌ W0 | ⬜ pending |
| SEC-01 (127.0.0.1 bind) | 1 | Server rejects connections to `0.0.0.0`/external IPs; binds only to loopback | probe | `./scripts/security-probes.sh bind` | ❌ W0 | ⬜ pending |
| SEC-02 (Host validation) | 1 | Requests with Host other than `127.0.0.1:<port>` or `localhost:<port>` return 400 before any other middleware runs | probe | `./scripts/security-probes.sh host` | ❌ W0 | ⬜ pending |
| SEC-03 (token auth) | 1 | Missing/incorrect token returns 403 on every `/api/*` and on WS/SSE upgrade; bypasses limited to `GET /` and `/api/session/adopt` | probe + unit | `./scripts/security-probes.sh token && pnpm -w vitest run server/auth.test.ts` | ❌ W0 | ⬜ pending |
| SEC-04 (CSP + nonce) | 1 | Response contains strict CSP: `default-src 'none'; script-src 'self' 'nonce-...'; connect-src 'self'; frame-ancestors 'none'`; no inline scripts without nonce | probe | `./scripts/security-probes.sh csp` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/package.json` — vitest devDep + `test` script (quick + full variants)
- [ ] `web/package.json` — vitest devDep + `test` script
- [ ] `server/vitest.config.ts` — Node environment, stub for MCP + Hono under test
- [ ] `web/vitest.config.ts` — jsdom environment (UI-SPEC state-route tests)
- [ ] `scripts/security-probes.sh` — shell harness that spins up the server on a free port, reads the printed URL, runs the 4 probe groups (bind, host, token, csp), and exits non-zero on any mismatch
- [ ] `shared/types.ts` — `DiffModel`, `DiffFile`, `Hunk`, `DiffLine` shape used by both ingesters AND the UI; fixtures derived from it
- [ ] Fixtures: small GitHub PR diff (captured via `gh pr diff` one-time) and local `git diff` sample committed under `tests/fixtures/`
- [ ] Minimum one `parse-diff` snapshot test proving opaque IDs `file:<index>`, `file:<index>:h<index>`, and `DiffLine.diffPosition` are stable across re-parses

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser auto-launch visible success | PLUG-03 | `open` shells out to macOS; no headless assertion covers the real `LSOpenURLs` path | Run `/review <pr>` in a fresh Claude Code session; default browser must come forward and show the diff within 3 seconds |
| Browser auto-launch failure fallback | PLUG-03 | Hard to simulate a missing browser in CI | Temporarily shadow `open` via PATH stub that exits 1; run `/review <pr>`; terminal must print the review URL and exit 0 |
| Visual diff fidelity vs UI-SPEC | PLUG-02, INGEST-01/02 | Pixel-level intent lives in UI-SPEC.md, not captured by unit tests | Run `/review` against the fixture PR; spot-check side-by-side diff rendering, line numbers, syntax-highlighting against UI-SPEC §Diff Canvas |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (vitest install, security-probes.sh, fixtures)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter (after plans authored and checker approves)

**Approval:** pending
