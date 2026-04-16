---
phase: "01-plugin-skeleton-secure-vertical-slice"
plan: "01"
subsystem: "monorepo-scaffold"
tags: ["scaffold", "types", "vitest", "fixtures", "eslint"]
dependency_graph:
  requires: []
  provides:
    - pnpm workspace with server/web/shared workspaces
    - shared/types.ts canonical type surface (DiffModel, ReviewSession, SSE message shapes)
    - vitest configs for server (Node) and web (happy-dom)
    - ESLint no-console rule on server workspace
    - Real diff fixtures for ingest tests
  affects:
    - All downstream plans import from shared/types.ts
    - Plan 02+ can author tests immediately (vitest configs exist)
    - Plan 03 replaces scripts/security-probes.sh placeholder
tech_stack:
  added:
    - "@modelcontextprotocol/sdk@1.29.0 (server dep)"
    - "hono@4.12.14 (server dep)"
    - "@hono/node-server@1.19.14 (server dep)"
    - "zod@4.3.6 (server dep)"
    - "execa@9.6.1 (server dep)"
    - "parse-diff@0.11.1 (server dep)"
    - "shiki@4.0.2 (server dep)"
    - "write-file-atomic@7.0.1 (server dep)"
    - "proper-lockfile@4.1.2 (server dep)"
    - "open@11.0.0 (server dep)"
    - "nanoid@5.1.9 (server dep)"
    - "react@19.2.5 (web dep)"
    - "react-dom@19.2.5 (web dep)"
    - "@git-diff-view/react@0.1.3 (web dep, pinned exact — pre-1.0)"
    - "lucide-react@1.8.0 (web dep)"
    - "vite@8.0.8 (web devDep)"
    - "tailwindcss@4.2.2 (web devDep)"
    - "typescript@6.0.2 (server+web devDep)"
    - "vitest (server+web devDep, latest)"
  patterns:
    - "pnpm workspaces (server/web/shared)"
    - "TypeScript module: Node16 for MCP SDK ESM subpath imports"
    - "D-17 opaque IDs in shared types (Hunk.id = fileId:h{n}, DiffLine.id = fileId:h{n}:l{n})"
    - "ESLint no-console rule blocks console.log in server/ workspace"
key_files:
  created:
    - path: "package.json"
      role: "pnpm workspace root"
    - path: "pnpm-workspace.yaml"
      role: "declares server/web/shared workspaces"
    - path: "tsconfig.base.json"
      role: "shared TS base config (strict, ES2022, @shared/* paths alias)"
    - path: ".gitignore"
      role: "ignores node_modules, dist, coverage, .vitest-cache, .DS_Store"
    - path: "server/package.json"
      role: "server workspace manifest with exact version pins"
    - path: "server/tsconfig.json"
      role: "server TS config — module: Node16, moduleResolution: Node16"
    - path: "server/vitest.config.ts"
      role: "server test config (Node env, passWithNoTests)"
    - path: "server/.eslintrc.cjs"
      role: "ESLint no-console rule for server workspace"
    - path: "server/src/test/helpers/build-test-app.ts"
      role: "stub SessionManager + empty Hono app for middleware tests"
    - path: "web/package.json"
      role: "web workspace manifest"
    - path: "web/tsconfig.json"
      role: "web TS config — jsx: react-jsx, module: ESNext, moduleResolution: Bundler"
    - path: "web/vitest.config.ts"
      role: "web test config (happy-dom env, React plugin, passWithNoTests)"
    - path: "web/src/test/setup.ts"
      role: "jest-dom matchers + MockEventSource on globalThis.EventSource"
    - path: "shared/package.json"
      role: "shared workspace manifest (no deps, main: types.ts)"
    - path: "shared/types.ts"
      role: "canonical Phase 1 type surface — DiffModel, ReviewSession, SSE messages"
    - path: "scripts/security-probes.sh"
      role: "placeholder stub (exits 2) — real implementation in Plan 03"
    - path: "tests/fixtures/github-pr.diff"
      role: "real gh pr diff 1 -R cli/cli output (2246 bytes) for ingest tests"
    - path: "tests/fixtures/github-pr-view.json"
      role: "synthetic gh pr view --json fixture matching D-15 fields"
    - path: "tests/fixtures/local.diff"
      role: "real git diff HEAD~1..HEAD from Task 1 commit (130705 bytes)"
    - path: "pnpm-lock.yaml"
      role: "lockfile from pnpm install --no-frozen-lockfile"
  modified: []
decisions:
  - "Pinned @git-diff-view/react at exact 0.1.3 (no caret) — pre-1.0 library per RESEARCH Pitfall 3"
  - "Pinned @modelcontextprotocol/sdk at exact 1.29.0 per spec"
  - "Added passWithNoTests: true to both vitest configs — vitest exits code 1 with no tests by default"
  - "Used real gh pr diff 1 -R cli/cli for github-pr.diff fixture (gh auth available)"
  - "local.diff captured from Task 1 commit diff (substantial real content)"
metrics:
  duration: "~8 minutes"
  completed_date: "2026-04-16"
  tasks_completed: 2
  files_created: 19
---

# Phase 01 Plan 01: Monorepo Scaffold + Shared Types Summary

**One-liner:** pnpm monorepo scaffold with TypeScript module:Node16 server, React 19 web SPA, and opaque-ID type surface from D-17.

## What Was Built

This plan created the complete monorepo foundation that every downstream plan depends on. No runtime code — only configuration, type contracts, test infrastructure, and fixtures.

**Workspace structure:**
- `server/` — Node.js MCP + Hono server workspace, TypeScript with `module: Node16` for MCP SDK ESM imports
- `web/` — Vite + React 19 SPA workspace, TypeScript with `moduleResolution: Bundler`
- `shared/` — Type-only barrel, no runtime deps

**Type surface (`shared/types.ts`):** Canonical shapes for the entire plugin — `DiffModel`, `DiffFile`, `Hunk`, `DiffLine` (with both `fileLine` and `diffPosition` fields), `ReviewSession`, `ShikiHunkTokens`, `ShikiFileTokens`, `SnapshotMessage`, `AppState`, `PullRequestMeta`, `FileStatus`, `LineKind`, `LineSide`. All opaque IDs documented per D-17 contract.

**Test infrastructure:** Both vitest configs resolve and exit 0 (no tests yet). `web/src/test/setup.ts` provides `MockEventSource` on `globalThis.EventSource` since happy-dom doesn't ship one.

**Security gate:** `server/.eslintrc.cjs` installs the `no-console` ESLint rule (blocks `console.log`, allows `console.error`/`console.warn`) before any server code lands — addresses RESEARCH Pitfall 1 (stdout corrupts MCP JSON-RPC).

## Resolved Dependency Versions (from pnpm-lock.yaml)

| Package | Resolved Version | Note |
|---------|-----------------|------|
| `@modelcontextprotocol/sdk` | `1.29.0` | Exact pin — no caret |
| `@git-diff-view/react` | `0.1.3` | Exact pin — pre-1.0, no caret |
| `hono` | `4.12.14` | Exact pin |
| `shiki` | `4.0.2` | Exact pin |
| `vite` | `8.0.8` | Exact pin |
| `react` | `19.2.5` | Exact pin |
| `tailwindcss` | `4.2.2` | Exact pin |
| `zod` | `4.3.6` | Exact pin |

## Fixture Capture

- `tests/fixtures/github-pr.diff` — **real `gh pr diff 1 -R cli/cli` output** (2246 bytes, 3 files changed). `gh` auth was available, so the real capture path was used (no fallback needed).
- `tests/fixtures/local.diff` — **real `git diff HEAD~1..HEAD`** from the Task 1 commit (130705 bytes — large because it includes the pnpm-lock.yaml addition).
- `tests/fixtures/github-pr-view.json` — synthetic fixture matching D-15 fields (`title`, `body`, `author.login`, `baseRefName`, `headRefName`, `baseRefOid`, `headRefOid`, `additions`, `deletions`, `changedFiles`).

## Shared Types Export Confirmation

All types required by Plan 02+ imports are exported from `shared/types.ts`:

| Type | Export | D-17 Compliant |
|------|--------|----------------|
| `DiffModel` | `export interface DiffModel` | — |
| `DiffFile` | `export interface DiffFile` | id = `sha1(path).slice(0,12)` |
| `Hunk` | `export interface Hunk` | id = `${fileId}:h${index}` |
| `DiffLine` | `export interface DiffLine` | id = `${fileId}:h${hunkIdx}:l${lineIdx}` |
| `ReviewSession` | `export interface ReviewSession` | — |
| `ShikiHunkTokens` | `export type ShikiHunkTokens` | — |
| `ShikiFileTokens` | `export type ShikiFileTokens` | — |
| `SnapshotMessage` | `export interface SnapshotMessage` | tokenLast4 only (never full token) |
| `AppState` | `export interface AppState` | 4-phase state machine |
| `PullRequestMeta` | `export interface PullRequestMeta` | source: github\|local |
| `FileStatus` | `export type FileStatus` | — |
| `LineKind` | `export type LineKind` | — |
| `LineSide` | `export type LineSide` | — |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added `passWithNoTests: true` to vitest configs**
- **Found during:** Task 2 verification
- **Issue:** vitest exits code 1 when no test files are found (default behavior). The plan's acceptance criteria requires "exits 0". This gap was not called out in the plan text.
- **Fix:** Added `passWithNoTests: true` to both `server/vitest.config.ts` and `web/vitest.config.ts`.
- **Files modified:** `server/vitest.config.ts`, `web/vitest.config.ts`
- **Commit:** aea06ef (included in Task 2 commit)

## Known Stubs

| File | Nature | Resolution Plan |
|------|--------|-----------------|
| `scripts/security-probes.sh` | Placeholder — exits 2 with "not implemented" message | Plan 03 will implement the 4 real curl probes per RESEARCH Example 4 |
| `server/src/test/helpers/build-test-app.ts` | Stub SessionManager — only implements `getSessionToken`, `getHttpPort`, `getLaunchUrl` | Real `SessionManager` class lands in Plan 02; stub is intentionally minimal for middleware-only tests |

## Threat Flags

None. This plan contains only configuration, type declarations, and test infrastructure — no network endpoints, auth paths, file access, or schema changes.

## Self-Check: PASSED

All 21 files confirmed present on disk. Both commits (25cb949, aea06ef) confirmed in git log.

| Check | Result |
|-------|--------|
| package.json exists | PASSED |
| pnpm-workspace.yaml exists | PASSED |
| server/tsconfig.json module:Node16 | PASSED |
| web/tsconfig.json jsx:react-jsx | PASSED |
| shared/types.ts exports 13 types | PASSED |
| pnpm install exits 0 | PASSED |
| pnpm-lock.yaml exists | PASSED |
| server vitest exits 0 | PASSED |
| web vitest exits 0 | PASSED |
| tests/fixtures/github-pr.diff > 100 bytes (2246) | PASSED |
| tests/fixtures/github-pr-view.json parses as JSON | PASSED |
| tests/fixtures/local.diff exists | PASSED |
| scripts/security-probes.sh is executable | PASSED |
| scripts/security-probes.sh exits non-zero | PASSED |
| server/.eslintrc.cjs has no-console rule | PASSED |
| web/src/test/setup.ts defines globalThis.EventSource | PASSED |
| Task 1 commit 25cb949 | PASSED |
| Task 2 commit aea06ef | PASSED |
