---
phase: "01-plugin-skeleton-secure-vertical-slice"
plan: "03"
subsystem: "http-security-layer"
tags: [security, middleware, csp, csrf, dns-rebinding, sse, static-serving]
dependency_graph:
  requires: [01-02]
  provides:
    - host-validate middleware (SEC-03 / T-01-01 DNS rebinding)
    - token-validate middleware (SEC-02 / T-01-02 CSRF + T-01-03 token leak)
    - secure-headers middleware (SEC-04 / T-01-04 SSRF via rendered content)
    - session-adopt route (POST /api/session/adopt)
    - events route (GET /api/events SSE stream)
    - static route (GET / + /assets/* with path traversal defense)
    - render-index nonce substitution
    - buildHttpApp factory wired into index.ts
    - scripts/security-probes.sh (4 real probes)
  affects: [01-04, 01-05, 01-06, 01-07]
tech_stack:
  added:
    - "@shared/types workspace:* — renamed shared package and linked via pnpm for Node16 tsc resolution"
  patterns:
    - "Hono middleware registration order: host → secureHeaders → tokenValidate (security boundary)"
    - "CSP nonce via hono/secure-headers NONCE sentinel — per-request, substituted into HTML"
    - "SSE streaming via hono/streaming streamSSE — snapshot + 15s keep-alive ping"
    - "httpOnly SameSite=Strict secure:false cookie for localhost token bootstrap"
    - "lsof-based bind-address check for macOS-compatible security probe 1"
key_files:
  created:
    - path: "server/src/http/server.ts"
      role: "buildHttpApp factory — mounts middleware in security-critical order"
    - path: "server/src/http/middleware/host-validate.ts"
      role: "SEC-03 Host header allowlist — 400 on bad host, 503 when port not ready"
    - path: "server/src/http/middleware/token-validate.ts"
      role: "SEC-02 token double-submit + SSE cookie-only path"
    - path: "server/src/http/middleware/secure-headers.ts"
      role: "SEC-04 CSP + NONCE via hono/secure-headers"
    - path: "server/src/http/routes/session-adopt.ts"
      role: "POST /api/session/adopt — exchange URL token for httpOnly cookie"
    - path: "server/src/http/routes/events.ts"
      role: "GET /api/events — SSE snapshot stream with keep-alive"
    - path: "server/src/http/routes/static.ts"
      role: "Static SPA serving (/assets/*) + GET / nonce-substitution handler"
    - path: "server/src/http/render-index.ts"
      role: "Read web/dist/index.html (or fallback), substitute __NONCE__ per request"
    - path: "server/src/http/__tests__/host-validate.test.ts"
      role: "7 tests including Pitfall-6 ordering canary"
    - path: "server/src/http/__tests__/token-validate.test.ts"
      role: "7 tests: adopt bypass, SSE cookie-only, double-submit, 403 paths"
    - path: "server/src/http/__tests__/secure-headers.test.ts"
      role: "9 tests: full CSP directive set, no ws://, nonce accessible"
    - path: "server/src/http/__tests__/session-adopt.test.ts"
      role: "7 tests: 200+cookie on correct token, 403 wrong, 400 bad body"
    - path: "server/src/http/__tests__/events.test.ts"
      role: "5 tests: 400 missing session, 404 unknown, 200 event-stream, snapshot content"
    - path: "scripts/security-probes.sh"
      role: "4 curl/lsof probes matching ROADMAP criterion #3 (macOS-compatible)"
  modified:
    - path: "server/src/index.ts"
      role: "Replace Plan-02 stub Hono app with buildHttpApp(manager)"
    - path: "server/tsconfig.json"
      role: "Added exclude for test files so tsc build compiles clean"
    - path: "server/package.json"
      role: "Added @shared/types workspace:* dep"
    - path: "shared/package.json"
      role: "Renamed package to @shared/types, added exports field for Node16"
    - path: "shared/types.js"
      role: "Tracked ESM stub (empty export {}) for @shared/types runtime resolution"
decisions:
  - "probe-1-lsof: Security probe 1 uses lsof (macOS) / ss (Linux) to verify bind address rather than curl http://0.0.0.0 — on macOS, 0.0.0.0 routes to loopback even for 127.0.0.1-only listeners, making the curl check a false positive"
  - "timing-oracle-accepted: token comparison uses === not crypto.timingSafeEqual — accepted for Phase 1 given 256-bit entropy + localhost Host-allowlist gate; documented for Phase 7 hardening"
  - "shared-package-rename: renamed shared package from 'shared' to '@shared/types' and added workspace:* dep in server/package.json — required for TypeScript Node16 module resolution to find @shared/types at build time without baseUrl hacks"
  - "tsconfig-exclude-tests: added exclude pattern for test files in server/tsconfig.json — test mock types (vitest Mocks) caused tsc errors when included in the build target"
metrics:
  duration: "~12 minutes"
  completed_date: "2026-04-16"
  tasks_completed: 2
  files_created: 15
---

# Phase 01 Plan 03: HTTP Security Layer Summary

**One-liner:** Host allowlist (SEC-03), CSP+nonce (SEC-04), token double-submit (SEC-02), session-adopt, SSE events, static serving — all wired as `buildHttpApp(manager)` in one security-ordered middleware chain.

## What Was Built

This plan ships the complete HTTP security surface for Phase 1. The middleware chain in `buildHttpApp` is the load-bearing security boundary: host → secureHeaders → tokenValidate, in that exact order.

### Task 1: Middleware chain

**`server/src/http/middleware/host-validate.ts`** — Exact-string Host header allowlist. Rejects anything not matching `127.0.0.1:<port>` or `localhost:<port>` with 400. Returns 503 if port not yet bound. Defeats DNS rebinding (T-01-01).

**`server/src/http/middleware/token-validate.ts`** — Two paths:
- SSE GET /api/events: cookie-only validation (`review_session` cookie must equal launch token) — EventSource can't set custom headers (D-10)
- All other /api/* POSTs: double-submit — `X-Review-Token` header must equal `review_session` cookie, both must equal launch token
- Bypass for `/api/session/adopt` (the bootstrap endpoint reads its own token from body)

**`server/src/http/middleware/secure-headers.ts`** — Wraps `hono/secure-headers` with the D-12/UI-SPEC CSP:
```
default-src 'self'; script-src 'self' 'nonce-{PER_REQ}'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; connect-src 'self'; font-src 'none'; object-src 'none'; frame-ancestors 'none'
```
No `ws://` in connect-src (D-01 honored). `unsafe-inline` in style-src for Tailwind 4 runtime custom props (UI-SPEC-locked).

**`server/src/http/server.ts`** — `buildHttpApp(manager)` factory. Middleware order:
1. `app.use('*', hostValidate(manager))` — FIRST (DNS rebinding defense)
2. `app.use('*', secureHeadersMw())` — CSP + nonce generation
3. `app.use('/api/*', tokenValidate(manager))` — Scoped, not applied to GET / or /assets/*

**Pitfall-6 ordering canary:** The test `"ordering canary: bad Host + no token returns 400 not 403"` confirms that a request with `Host: evil.com` returns 400 (host rejection), NOT 403 (token rejection). This test would fail if the middleware order were swapped.

### Task 2: Routes + index.ts wired + security probes

**`server/src/http/routes/session-adopt.ts`** — POST /api/session/adopt. Zod-validates `{token: string}` body. On match: sets `review_session=<token>; HttpOnly; SameSite=Strict; Path=/; Secure=false` (localhost has no TLS — Secure=true would prevent cookie from ever being sent). Returns `{ok: true}`.

**`server/src/http/routes/events.ts`** — GET /api/events?session=<prKey>. Returns SSE stream via `streamSSE`. Emits one `event: snapshot` with full `SnapshotMessage` JSON payload, then keep-alive `event: ping` every 15 seconds.

**`server/src/http/routes/static.ts`** — `/assets/*` served via `serveStatic({root: './web/dist'})` (scoped, path traversal defense). `GET /` returns nonce-substituted HTML from `renderIndex(c.get('secureHeadersNonce'))`.

**`server/src/http/render-index.ts`** — Reads `web/dist/index.html` once (cached), falls back to a hardcoded HTML stub when dist not built. Calls `replaceAll('__NONCE__', nonce)` per request.

**`server/src/index.ts`** — Plan-02 stub Hono app replaced with `buildHttpApp(manager)`. The `Hono` import was removed (no longer needed directly in index.ts).

**`scripts/security-probes.sh`** — Real 4-probe implementation replacing the Plan-01 placeholder stub:
- Probe 1: `lsof`-based bind-address check (macOS-compatible — curl to 0.0.0.0 on macOS routes to loopback even for 127.0.0.1-only listeners)
- Probe 2: Missing token → 403 on `/api/events`
- Probe 3: Forged `Host: evil.com` → 400
- Probe 4: CSP header present on `GET /`

## Live Server Probe Output

Captured against `dist/index.js` booted on port 53963:

```
$ bash scripts/security-probes.sh 53963
OK
```

All 4 probes passed.

## CSP Header Emitted by Live Server

```
content-security-policy: default-src 'self'; script-src 'self' 'nonce-d4yY1vZluuY1EG7wmCDNpw=='; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'none'; object-src 'none'; frame-ancestors 'none'
```

## Nonce Consistency Verification

Within a single HTTP request (`curl -si`), the nonce value in the `Content-Security-Policy` header MATCHES the `nonce=` attribute on the `<script>` tag in the HTML body:

```
Nonce in CSP:  1WHSQ95PGfTkfZHZLaIX5g==
Nonce in HTML: 1WHSQ95PGfTkfZHZLaIX5g==
Nonce MATCH:   YES
```

## Security Controls Verified

| Requirement | Control | Verified By |
|-------------|---------|-------------|
| SEC-01 | 127.0.0.1-only bind | security-probes.sh probe 1 (lsof) |
| SEC-02 | Token double-submit + httpOnly SameSite=Strict | security-probes.sh probe 2 + session-adopt.test.ts |
| SEC-03 | Host allowlist | security-probes.sh probe 3 + host-validate.test.ts |
| SEC-04 | CSP + frame-ancestors 'none' | security-probes.sh probe 4 + secure-headers.test.ts |
| T-01-01 | DNS rebinding blocked | Pitfall-6 ordering canary test |
| T-01-03 | Token exchanged for cookie | session-adopt.test.ts |
| T-01-07 | Path traversal blocked | serveStatic root: './web/dist' (scoped) |
| T-01-08 | Timing oracle | ACCEPTED — `===` comparison, Phase 7 hardening documented below |

## Timing Oracle — Phase 7 Hardening Flag

`token-validate.ts` uses `===` for token comparison. This is accepted for Phase 1 because:
- Token has 256-bit entropy (crypto.randomBytes(32).toString('base64url'))
- Server is localhost-bound with Host allowlist gate before token compare
- Attack requires a same-origin request to even reach tokenValidate

**Scheduled upgrade:** Replace `header !== launchToken` and `cookie !== launchToken` with `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` in Phase 7 hardening plan.

## Test Results

```
Test Files  12 passed (12)
     Tests  62 passed (62)
```

New tests added this plan: 35 tests across 5 test files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] @shared/types workspace linking for Node16 tsc**
- **Found during:** Task 2 verification (pnpm build)
- **Issue:** `tsc -p tsconfig.json` failed with "Cannot find module '@shared/types'" because the shared package was named `"shared"` (not `"@shared/types"`), so pnpm never created a `node_modules/@shared/types` symlink. TypeScript Node16 module resolution requires packages to be in node_modules — the `paths` tsconfig alias only handles type resolution in vitest (via vitest.config.ts `resolve.alias`), not tsc builds.
- **Fix:** Renamed `shared/package.json` `name` field from `"shared"` to `"@shared/types"`, added `exports` field for Node16, added `"@shared/types": "workspace:*"` to `server/package.json` deps, ran `pnpm install --no-frozen-lockfile` to create the symlink. Also excluded test files from `server/tsconfig.json` (test mock types caused separate tsc errors when test files were included in the build).
- **Files modified:** `shared/package.json`, `server/package.json`, `server/tsconfig.json`, `pnpm-lock.yaml`
- **Commit:** 92fa8fe

**2. [Rule 2 - Missing critical functionality] macOS-compatible security probe 1**
- **Found during:** Task 2 live-server probe run
- **Issue:** Original probe 1 (`curl http://0.0.0.0:PORT`) was designed for Linux where `0.0.0.0` returns ECONNREFUSED for a 127.0.0.1-only listener. On macOS, `0.0.0.0` routes to loopback regardless, so curl succeeds (returns the "Bad host" 400 response) and the probe falsely fails.
- **Fix:** Replaced curl-based probe 1 with `lsof -iTCP:PORT -sTCP:LISTEN` to directly verify the bind address is `127.0.0.1:PORT`, not `0.0.0.0:PORT` or `*:PORT`. Added Linux fallback via `ss -tlnp`.
- **Files modified:** `scripts/security-probes.sh`
- **Commit:** 92fa8fe

**3. [Note — TDD gate] Task 2 test files passed immediately on first run**
- Task 2's route files (`session-adopt.ts`, `events.ts`, `static.ts`) were created during Task 1's GREEN phase as dependencies for `buildHttpApp`. When Task 2's test files were written, the implementations already existed, so the tests passed on first run (no RED phase for Task 2 routes). The TDD gate was satisfied for Task 1 (tests failed at RED, passed at GREEN). Task 2's tests serve as regression coverage.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `export {}` | `shared/types.js` | 3 | ESM stub for Node16 runtime resolution; actual types are in `types.ts` which TypeScript resolves at build time |
| Keep-alive ping loop | `events.ts` | 28-30 | Infinite loop never exits; in practice the SSE connection is aborted by the client. Phase 2 wires the `onAbort` handler to release bus subscriptions |

## Threat Flags

None — all surfaces introduced were planned in the threat model and properly mitigated.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| server/src/http/server.ts exists | PASSED |
| server/src/http/middleware/host-validate.ts exists | PASSED |
| server/src/http/middleware/token-validate.ts exists | PASSED |
| server/src/http/middleware/secure-headers.ts exists | PASSED |
| server/src/http/routes/session-adopt.ts exists | PASSED |
| server/src/http/routes/events.ts exists | PASSED |
| server/src/http/routes/static.ts exists | PASSED |
| server/src/http/render-index.ts exists | PASSED |
| scripts/security-probes.sh executable and exits 0 | PASSED |
| server/src/index.ts uses buildHttpApp | PASSED |
| No ws:// in secure-headers.ts | PASSED |
| middleware order: host → secureHeaders → tokenValidate | PASSED |
| Pitfall-6 ordering canary test passes (400 not 403) | PASSED |
| pnpm --filter server build exits 0 | PASSED |
| pnpm --filter server exec tsc --noEmit exits 0 | PASSED |
| 62 tests pass | PASSED |
| security-probes.sh exits 0 against live server | PASSED |
| Nonce in CSP matches nonce in HTML (single request) | PASSED |
| Commit 9312633 (test RED Task 1) | PASSED |
| Commit 0fac527 (feat GREEN Task 1) | PASSED |
| Commit 92fa8fe (feat Task 2 + routes + index.ts + probes) | PASSED |
| Commit 4545ada (chore shared/types.js) | PASSED |
