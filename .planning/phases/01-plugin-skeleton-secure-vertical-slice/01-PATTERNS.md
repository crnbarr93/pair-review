# Phase 1: Plugin Skeleton + Secure Vertical Slice — Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 48 files to be created / modified (full file list below)
**Analogs found:** 42 / 48 with concrete reference patterns; 6 are design-from-scratch with citations to governing docs only

> **Greenfield disclaimer.** This repo has zero prior source code — only `.planning/` docs and `CLAUDE.md` at the root. There are **no in-repo analogs**. Every "pattern source" below is an **external reference-grade pattern** from (a) the tech-stack docs locked in `CLAUDE.md`, (b) verbatim code shapes in `01-RESEARCH.md`, or (c) the approved `01-UI-SPEC.md`. Citations point to the canonical doc + heading the planner should re-open when implementing.
>
> All excerpts below are ≤20 lines. Where a code shape does not yet exist in any documented source (e.g., the `DiffModel` shaper, the `SessionManager` class, the `logger.ts` stderr-only helper), the file is flagged **DESIGN-FROM-SCRATCH** and the planner is directed to the nearest-shape pattern plus the contract the file must satisfy.

---

## File Classification

All files below are **new creations**. No modifications — the repo contains no source code yet.

### Plugin manifest & entry (4 files)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.claude-plugin/plugin.json` | plugin-manifest (config) | static declaration read by Claude Code at load | [RESEARCH §Example 6: `.claude-plugin/plugin.json`] | exact |
| `.mcp.json` (at plugin root) | mcp-server-config (config) | read by Claude Code to spawn MCP process | [RESEARCH §Example 5: `.mcp.json` at plugin root] | exact |
| `commands/review.md` | slash-command-prompt (LLM prompt template) | `$ARGUMENTS` → prompt → LLM tool-call | [RESEARCH §Example 1: `commands/review.md`] | exact |
| `package.json` (root) + `pnpm-workspace.yaml` | workspace-root (config) | declares server/ and web/ workspaces | [RESEARCH §Installation] + [CLAUDE.md §Plugin Layout] | role-match |

### Server — lifecycle & logging (3 files)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/index.ts` | process-entry-point (lifecycle orchestrator) | boots MCP + HTTP, wires shutdown | [RESEARCH §Pattern 1: MCP + HTTP in one Node process] | exact |
| `server/src/logger.ts` | stderr-only logger (utility) | all log calls → `process.stderr.write` | **DESIGN-FROM-SCRATCH** — contract: [RESEARCH §Anti-Patterns / §Pitfall 1] and [ARCHITECTURE.md AP2] |
| `server/package.json` + `server/tsconfig.json` | workspace-config (config) | declares `"type": "module"`, `"module": "Node16"` | [CLAUDE.md §Version Compatibility] |

### Server — MCP layer (2 files)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/mcp/server.ts` | mcp-server-factory (wiring) | constructs `McpServer` + `StdioServerTransport` | [RESEARCH §Pattern 1] + [Context7 `/modelcontextprotocol/typescript-sdk` §server-quickstart] | exact |
| `server/src/mcp/tools/start-review.ts` | mcp-tool-handler (request-response) | zod validation → SessionManager.startReview → text content return | [RESEARCH §Example 2: `start_review` MCP tool] | exact |

### Server — HTTP layer (8 files)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/http/server.ts` | hono-app-factory (middleware chain composition) | mounts middleware in security-critical order | [RESEARCH §Pattern 2: Fail-Closed Hono Middleware Chain] | exact |
| `server/src/http/middleware/host-validate.ts` | middleware (request-gate) | reject non-localhost Host → 400 early-return | [RESEARCH §Pattern 3: Host Header Allowlist Middleware] | exact |
| `server/src/http/middleware/token-validate.ts` | middleware (request-gate) | header+cookie double-submit → 403 on miss | [RESEARCH §Pattern 4: Token Validation] | exact |
| `server/src/http/middleware/secure-headers.ts` | middleware-wrapper (request-response) | wraps `hono/secure-headers` with our CSP | [RESEARCH §Pattern 2] + [Context7 `/websites/hono_dev` §secure-headers] | exact |
| `server/src/http/routes/session-adopt.ts` | http-route (request-response, POST) | reads query token → validates → sets httpOnly cookie | [RESEARCH §Pattern 5: Session Adopt + SSE Snapshot] (first block) | exact |
| `server/src/http/routes/events.ts` | http-route (streaming, SSE) | streamSSE → writeSSE `event: snapshot` + keep-alive pings | [RESEARCH §Pattern 5] (second block) + [Context7 `/websites/hono_dev` §streaming] | exact |
| `server/src/http/routes/static.ts` | http-route (static-serve) | `serveStatic('/assets/*')` + `GET /` nonce-substitution | [RESEARCH §Pitfall 9: Vite dev vs build mismatch] + [Context7 `/websites/hono_dev` §serveStatic] | role-match |
| `server/src/http/render-index.ts` | template-helper (utility) | read `web/dist/index.html`, substitute `__NONCE__` | **DESIGN-FROM-SCRATCH** — contract: [RESEARCH §Pitfall 9] |

### Server — session state (3 files)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/session/manager.ts` | session-manager (in-memory singleton) | Map<pr-key, Session> + sessionToken holder + startReview orchestrator | **DESIGN-FROM-SCRATCH** — contract: [RESEARCH §System Architecture Diagram "SessionManager" box] + [D-08, D-18, D-21 in CONTEXT] |
| `server/src/session/types.ts` | shared types (type-only) | type exports re-imported from shared/ | [RESEARCH §Pattern 6: `DiffModel` / `Hunk.id` shape] + [D-17] | role-match |
| `server/src/session/key.ts` | pure-utility (transform) | derive `gh:<o>/<r>#<n>` or `local:<sha256(...)>` pr-key | **DESIGN-FROM-SCRATCH** — contract: [D-05 in CONTEXT] |

### Server — ingestion (4 files)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/ingest/github.ts` | ingest-adapter (execa → gh CLI) | `gh pr view --json` + `gh pr diff` via execa | [RESEARCH §Pattern 6: GitHub path] + [RESEARCH §Example 2 scope] | exact |
| `server/src/ingest/local.ts` | ingest-adapter (execa → git CLI) | `git rev-parse --verify` + `git diff base...head` via execa | [RESEARCH §Pattern 6: local path] | exact |
| `server/src/ingest/parse.ts` | diff-shaper (transform) | `parse-diff` → `DiffModel` with opaque `fileId:h{n}` IDs | [RESEARCH §Pattern 6: parse shape per D-17] | exact |
| `server/src/ingest/repo-infer.ts` | ingest-helper (execa → gh CLI) | `gh repo view --json name,owner` from cwd | [RESEARCH §Pitfall 4] + [CONTEXT D-14] | role-match |

### Server — highlighting (1 file)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/highlight/shiki.ts` | highlighter + in-memory LRU (transform + cache) | Shiki singleton + Map<`path@headSha`, tokens[]> | [RESEARCH §Pattern 7: Shiki Server-Side Highlighting] + [Context7 `/shikijs/shiki`] | exact |

### Server — persistence (2 files)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/persist/paths.ts` | path-resolver (utility) | `${CLAUDE_PLUGIN_DATA}/reviews/<pr-key>/state.json` + dev fallback | **DESIGN-FROM-SCRATCH** — contract: [D-05] + [RESEARCH §Pitfall 5] |
| `server/src/persist/store.ts` | persistence-wrapper (file-I/O, atomic) | `write-file-atomic` + `proper-lockfile` acquire/release | [RESEARCH §Don't Hand-Roll: atomic file writes + cross-process locks] + [npm `write-file-atomic`, `proper-lockfile` READMEs] | role-match |

### Server — browser launch (1 file)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/browser-launch.ts` | utility (side-effect) | stderr echo URL FIRST, then `open(url)` | [RESEARCH §System Architecture — browser launch arrow] + [D-13, PLUG-03] | role-match |

### Web — app shell & bootstrap (7 files)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `web/index.html` | html-entry (template) | single nonce'd `<script type="module">` with `__NONCE__` placeholder | [RESEARCH §Pitfall 9] + [UI-SPEC §CSP Compatibility] | role-match |
| `web/src/main.tsx` | web-bootstrap (entry) | adopt token → wipe query → EventSource → render | [RESEARCH §Example 3: Browser entry] | exact |
| `web/src/App.tsx` | root-component (state router) | reads session state → routes to 4 UI-SPEC diff-canvas states | **DESIGN-FROM-SCRATCH** — contract: [UI-SPEC §Component Inventory §DiffCanvas + §Copywriting Contract] + [D-24] |
| `web/src/api.ts` | fetch-helpers (request-response) | `adoptSession(token)` + `openEventStream()` | [RESEARCH §Example 3] (extract helpers from the `bootstrap()` body) | role-match |
| `web/src/store.ts` | state-store (state-machine) | session reducer (planner's call: `useReducer` or Zustand) | **DESIGN-FROM-SCRATCH** — contract: [CONTEXT "Claude's Discretion"] + [UI-SPEC §Interaction Contract §Loading behavior] |
| `web/src/types.ts` | shared-types-reexport (type-only) | re-export from `shared/types.ts` | n/a (thin re-export) |
| `web/vite.config.ts` + `web/tailwind.config.ts` + `web/tsconfig.json` | config (build) | Vite React plugin + Tailwind 4 `@theme` | [CLAUDE.md §Technology Stack Vite/Tailwind rows] + [UI-SPEC §Tailwind 4 Token Declarations] | role-match |

### Web — UI components (UI-SPEC driven, 9 files)

All components are one-to-one with `01-UI-SPEC.md §Component Inventory`. The UI-SPEC is the contract; these have **no external code analog** — the pattern source is the UI-SPEC section itself.

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `web/src/components/AppShell.tsx` | layout-component (3-slot) | wraps viewport, header/main/footer | [UI-SPEC §Component Inventory §`<AppShell>`] | contract-match |
| `web/src/components/AppHeader.tsx` | layout-component | PR title + source badge + status pill | [UI-SPEC §`<AppHeader>`] | contract-match |
| `web/src/components/AppFooter.tsx` | layout-component | session token status + local URL (click-to-copy) | [UI-SPEC §`<AppFooter>`] | contract-match |
| `web/src/components/SessionStatusPill.tsx` | ui-atom (state-driven) | 2 states: Active / Expired per UI-SPEC table | [UI-SPEC §`<SessionStatusPill>`] | contract-match |
| `web/src/components/DiffCanvas.tsx` | layout-component (state-router) | routes to one of 4 states (Loading/Empty/Error/DiffLoaded) | [UI-SPEC §`<DiffCanvas>`] + [D-24] | contract-match |
| `web/src/components/DiffView.tsx` | diff-render-wrapper (transform) | wraps `@git-diff-view/react` `DiffView` | [npm `@git-diff-view/react@0.1.3` README] + [UI-SPEC §`<DiffView>`] — **flag pre-1.0 library risk per [RESEARCH §Pitfall 3]** |
| `web/src/components/LoadingState.tsx` | ui-atom (presentational) | single pulsing skeleton bar | [UI-SPEC §`<LoadingState>`] | contract-match |
| `web/src/components/EmptyState.tsx` | ui-atom (presentational) | Lucide icon + heading + body, copy locked in UI-SPEC | [UI-SPEC §`<EmptyState>` + §Copywriting Contract] | contract-match |
| `web/src/components/ErrorState.tsx` | ui-atom (presentational) | 2 copy variants (unreachable / fetch failed) | [UI-SPEC §`<ErrorState>` + §Copywriting Contract] | contract-match |

### Web — styling (1 file)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `web/src/index.css` | css-theme (tokens) | Tailwind 4 `@theme {}` block — exact tokens from UI-SPEC | [UI-SPEC §Tailwind 4 Token Declarations] — **copy verbatim** | exact |

### Shared (1 file)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `shared/types.ts` | shared-types (type-only) | `DiffModel`, `ReviewSession`, SSE message shapes | [RESEARCH §Pattern 6] + [D-17] | role-match |

### Validation / scripts (2 files)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/security-probes.sh` | validation-script (bash) | 4 curl probes (bind, token, host, CSP) | [RESEARCH §Example 4: Required curl probes] | exact |
| `server/vitest.config.ts` + `web/vitest.config.ts` | test-config | vitest + happy-dom (web) | [RESEARCH §Validation Architecture §Wave 0 Gaps] | role-match |

### Tests (6 files — one per security control + key behaviors)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/http/__tests__/host-validate.test.ts` | integration-test | asserts 400 on bad Host | [RESEARCH §Validation Architecture row SEC-03] | contract-match |
| `server/src/http/__tests__/token-validate.test.ts` | integration-test | asserts 403 on missing/mismatched token | [RESEARCH §Validation Architecture row SEC-02] | contract-match |
| `server/src/http/__tests__/secure-headers.test.ts` | integration-test | asserts CSP header contents + nonce in HTML | [RESEARCH §Validation Architecture row SEC-04] | contract-match |
| `server/src/ingest/__tests__/parse.test.ts` | unit-test | asserts opaque-ID shape `Hunk.id = ${fileId}:h${i}` | [RESEARCH §Validation Architecture row D-17] | contract-match |
| `server/src/mcp/tools/__tests__/start-review.test.ts` | integration-test | asserts zod schema + return shape | [RESEARCH §Validation Architecture row D-20] | contract-match |
| `web/src/__tests__/states.test.tsx` | component-test | asserts 4 UI-SPEC states render correctly | [RESEARCH §Validation Architecture rows UI-SPEC state: *] | contract-match |

---

## Pattern Assignments

### `server/src/index.ts` (process-entry-point, lifecycle)

**Analog:** [RESEARCH §Pattern 1: MCP + HTTP in one Node process] — code shape is verbatim.

**Lifecycle pattern** (reproduce verbatim; ~20 lines):

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serve } from '@hono/node-server';
import crypto from 'node:crypto';

async function main() {
  const sessionToken = crypto.randomBytes(32).toString('base64url');
  const manager = new SessionManager({ sessionToken });
  const app = buildHttpApp({ manager });
  const httpServer = serve(
    { fetch: app.fetch, port: 0, hostname: '127.0.0.1' },
    (info) => {
      const url = `http://127.0.0.1:${info.port}/?token=${sessionToken}`;
      logger.info(`Review server listening at ${url}`);   // STDERR (D-13)
      manager.setLaunchUrl(url);
    }
  );
  const mcp = new McpServer({ name: 'git-review-plugin', version: '0.1.0' }, { capabilities: { logging: {} } });
  registerStartReview(mcp, manager);
  await mcp.connect(new StdioServerTransport());
  process.on('SIGTERM', () => httpServer.close(() => process.exit(0)));
  process.on('SIGINT', () => httpServer.close(() => process.exit(0)));
}
main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
```

**Citation:** [RESEARCH §Pattern 1] + [Context7 `/modelcontextprotocol/typescript-sdk` §server-quickstart] + [Context7 `/websites/hono_dev` §getting-started-nodejs (graceful shutdown)].

**Hard rules:**
- `port: 0`, `hostname: '127.0.0.1'` — never `0.0.0.0`, never `::` ([SEC-01, D-07]).
- Stderr URL echo happens **inside the `serve()` callback, before browser launch** ([D-13, PLUG-03]).
- Stdout is reserved for MCP JSON-RPC — never `console.log` ([AP2]).

---

### `server/src/logger.ts` (stderr-only logger, utility) — DESIGN-FROM-SCRATCH

No code analog exists. Contract: every `logger.info/warn/error` MUST route to `process.stderr.write`. Never touch stdout.

**Nearest shape** (write from scratch, this small):

```typescript
const prefix = (level: string) => `[${new Date().toISOString()}] [${level}] `;
export const logger = {
  info: (msg: string, ...rest: unknown[]) => process.stderr.write(prefix('info') + msg + (rest.length ? ' ' + JSON.stringify(rest) : '') + '\n'),
  warn: (msg: string, ...rest: unknown[]) => process.stderr.write(prefix('warn') + msg + (rest.length ? ' ' + JSON.stringify(rest) : '') + '\n'),
  error: (msg: string, err?: unknown) => process.stderr.write(prefix('error') + msg + (err ? ' ' + (err instanceof Error ? err.stack : JSON.stringify(err)) : '') + '\n'),
};
```

**Citation:** [RESEARCH §Anti-Patterns / §Pitfall 1 — stdout corruption] + [ARCHITECTURE.md AP2].

**Enforcement:** ESLint rule `no-console: ["error", { allow: ["error", "warn"] }]` on `server/` — `console.error` and `console.warn` also go to stderr and are permitted; only `console.log` is forbidden. Plan to add this rule as a Wave-0 task.

---

### `server/src/mcp/tools/start-review.ts` (mcp-tool-handler, request-response)

**Analog:** [RESEARCH §Example 2: `start_review` MCP tool] — code shape is verbatim.

**Zod schema pattern** (lines 1-12):

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const Source = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('github'), url: z.string().url() }),
  z.object({ kind: z.literal('github'), number: z.number().int().positive() }),
  z.object({ kind: z.literal('local'), base: z.string().min(1), head: z.string().min(1) }),
]);
const Input = z.object({ source: Source });
```

**Handler pattern** (lines 15-28):

```typescript
mcp.registerTool(
  'start_review',
  { title: 'Start Review', description: '...', inputSchema: Input },
  async ({ source }) => {
    try {
      const session = await manager.startReview(source);
      return { content: [{ type: 'text', text: renderSummary(session, manager.getLaunchUrl()) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: renderFriendlyError(err) }], isError: true };
    }
  }
);
```

**Return summary shape** — must include title, author, base→head, stats, paraphrased PR body, final `Review open at: <url>` line ([D-20]).

**Citation:** [RESEARCH §Example 2] + [D-19, D-20] + [Context7 `/modelcontextprotocol/typescript-sdk` §registerTool pattern].

---

### `server/src/http/server.ts` (hono-app-factory)

**Analog:** [RESEARCH §Pattern 2: Fail-Closed Hono Middleware Chain] — order-sensitive, load-bearing.

**Middleware registration order** (this order is the security boundary — do not reorder):

```typescript
const app = new Hono();
app.use('*', hostValidate(manager));                    // 1. FIRST — 400 on bad Host (DNS rebinding)
app.use('*', secureHeaders({                            // 2. CSP + NONCE before any route
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", NONCE],
    styleSrc: ["'self'", "'unsafe-inline'"],            // UI-SPEC-locked (Tailwind 4)
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],                              // No ws:// — D-01 killed WebSocket
    fontSrc: ["'none'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
  },
}));
app.use('/api/*', tokenValidate(manager));              // 3. 403 on missing/wrong token
mountSessionAdopt(app, manager);
mountEvents(app, manager);
app.use('/assets/*', serveStatic({ root: './web/dist' }));
app.get('/', (c) => c.html(renderIndex(c.get('secureHeadersNonce')!)));
return app;
```

**Citation:** [RESEARCH §Pattern 2] + [Context7 `/websites/hono_dev` §secure-headers] + [D-11, D-12].

**Hard rules:**
- Host-validate MUST be before `secureHeaders` so a forged-Host request returns 400, not a 403 with CSP leaked. Integration test at `host-validate.test.ts` enforces this.
- `secureHeaders` handles the nonce; template uses `c.get('secureHeadersNonce')`.
- `tokenValidate` is scoped to `/api/*` so `GET /` (the bootstrap HTML) and `/assets/*` don't require a cookie.

---

### `server/src/http/middleware/host-validate.ts` (middleware, request-gate)

**Analog:** [RESEARCH §Pattern 3: Host Header Allowlist Middleware] — code shape is verbatim.

**Full pattern** (~10 lines — this file is tiny on purpose):

```typescript
import type { MiddlewareHandler } from 'hono';

export function hostValidate(manager: SessionManager): MiddlewareHandler {
  return async (c, next) => {
    const host = (c.req.header('host') ?? '').toLowerCase();
    const port = manager.getHttpPort();
    if (port == null) return c.text('Server not ready', 503);
    const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!allowed.has(host)) return c.text('Bad host', 400);
    return next();
  };
}
```

**Citation:** [RESEARCH §Pattern 3] + [D-11] + [PITFALLS.md §Pitfall 6].

**Hard rules:**
- Exact-string equality. Never regex the Host header.
- `.toLowerCase()` defense-in-depth (Node already lowercases).
- 400, not 404 — the request is malformed, not missing.

---

### `server/src/http/middleware/token-validate.ts` (middleware, request-gate)

**Analog:** [RESEARCH §Pattern 4: Token Validation] — code shape is verbatim.

**Full pattern** (~18 lines):

```typescript
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';

export function tokenValidate(manager: SessionManager): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.path === '/api/session/adopt') return next();   // Bypass: reads token from body
    const cookie = getCookie(c, 'review_session');
    const launchToken = manager.getSessionToken();
    // SSE: EventSource can't set custom headers → cookie-only (SameSite=Strict closes CSRF)
    if (c.req.method === 'GET' && c.req.path === '/api/events') {
      if (cookie !== launchToken) return c.text('Forbidden', 403);
      return next();
    }
    const header = c.req.header('x-review-token');
    if (!header || !cookie || header !== cookie || header !== launchToken) {
      return c.text('Forbidden', 403);
    }
    return next();
  };
}
```

**Citation:** [RESEARCH §Pattern 4] + [D-08, D-09, D-10] + [SEC-02].

**Flagged upgrade for Phase 7:** replace `===` with `crypto.timingSafeEqual` on buffers. Acceptable for Phase 1 given 256-bit token entropy on localhost.

---

### `server/src/http/routes/session-adopt.ts` (http-route, POST)

**Analog:** [RESEARCH §Pattern 5 — first block]. Code shape is verbatim.

**Full pattern** (~14 lines):

```typescript
import { setCookie } from 'hono/cookie';
import { z } from 'zod';

const AdoptInput = z.object({ token: z.string().min(1) });

export function mountSessionAdopt(app: Hono, manager: SessionManager) {
  app.post('/api/session/adopt', async (c) => {
    const body = AdoptInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.text('Bad request', 400);
    if (body.data.token !== manager.getSessionToken()) return c.text('Forbidden', 403);
    setCookie(c, 'review_session', manager.getSessionToken(), {
      httpOnly: true, sameSite: 'Strict', secure: false, path: '/',
    });
    return c.json({ ok: true });
  });
}
```

**Citation:** [RESEARCH §Pattern 5] + [D-09].

**Hard rule:** `secure: false` — 127.0.0.1 has no TLS; `secure: true` would make the cookie never sent.

---

### `server/src/http/routes/events.ts` (http-route, SSE streaming)

**Analog:** [RESEARCH §Pattern 5 — second block]. Code shape is verbatim.

**Full pattern** (~18 lines):

```typescript
import { streamSSE } from 'hono/streaming';

export function mountEvents(app: Hono, manager: SessionManager) {
  app.get('/api/events', (c) => {
    const prKey = c.req.query('session');
    if (!prKey) return c.text('Missing session', 400);
    const session = manager.get(prKey);
    if (!session) return c.text('Unknown session', 404);

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: 'snapshot', data: JSON.stringify(session), id: '0' });
      stream.onAbort(() => { /* Phase 2 will release bus subscription here */ });
      while (true) {
        await stream.sleep(15_000);
        await stream.writeSSE({ event: 'ping', data: '' });
      }
    });
  });
}
```

**Citation:** [RESEARCH §Pattern 5] + [Context7 `/websites/hono_dev` §streaming] + [D-01, D-02].

---

### `server/src/http/routes/static.ts` + `server/src/http/render-index.ts` (static-serve + template)

**Analog:** [RESEARCH §Pitfall 9: Vite dev vs build mismatch] + [Context7 `/websites/hono_dev` §serveStatic].

**Nonce-substitution pattern** (DESIGN-FROM-SCRATCH, but contract is locked):

```typescript
// render-index.ts: read web/dist/index.html once at boot, substitute __NONCE__ per request
import { readFileSync } from 'node:fs';
let template: string | null = null;
export function renderIndex(nonce: string): string {
  if (template == null) template = readFileSync('./web/dist/index.html', 'utf8');
  return template.replaceAll('__NONCE__', nonce);   // Vite emits hashed <script src>; only the nonce attr is ours
}
```

**Hard rule:** Vite emits `/assets/main-[hash].js`. We DO NOT touch the `src` attribute. Only `nonce="__NONCE__"` is substituted.

**Citation:** [RESEARCH §Pitfall 9] + [UI-SPEC §CSP Compatibility].

---

### `server/src/session/manager.ts` (session-manager, in-memory singleton) — DESIGN-FROM-SCRATCH

No code analog. Contract from [RESEARCH §System Architecture Diagram "SessionManager" box] + [D-08, D-18, D-21].

**Required methods:**

| Method | Purpose | Source |
|---|---|---|
| `getSessionToken(): string` | returns the single per-launch token | [D-08] |
| `getHttpPort(): number \| null` | returns OS-assigned port (null until `setHttpPort` fires) | [RESEARCH §Pattern 3 uses this] |
| `setHttpPort(port: number)` | called inside `serve()` info callback | [RESEARCH §Pattern 1] |
| `setLaunchUrl(url: string)` / `getLaunchUrl(): string` | the `http://127.0.0.1:PORT/?token=...` string | [D-20 return-value shape] |
| `get(prKey: string): ReviewSession \| undefined` | get existing session | [RESEARCH §Pattern 5] |
| `startReview(source): Promise<ReviewSession>` | idempotent on pr-key; ingest + parse + highlight + persist + return | [D-14, D-17, D-21, D-22] |

**Idempotency rule:** If `manager.get(prKey)` returns an existing session, `startReview` returns it without re-ingesting and WITHOUT re-launching the browser ([D-21]).

**Browser launch rule:** First `startReview` call for a pr-key MUST trigger `browser-launch.ts` (stderr echo first, then `open`). Second call MUST NOT.

---

### `server/src/session/key.ts` — DESIGN-FROM-SCRATCH

**Contract** from [D-05]:
- GitHub PR: `gh:<owner>/<repo>#<number>`
- Local diff: `local:<sha256(repoPath + baseRef + headRef)>` (use `node:crypto.createHash('sha256')`)

**Nearest shape:**

```typescript
import { createHash } from 'node:crypto';
export function githubKey(owner: string, repo: string, number: number) { return `gh:${owner}/${repo}#${number}`; }
export function localKey(repoPath: string, base: string, head: string) {
  return `local:${createHash('sha256').update(`${repoPath}\0${base}\0${head}`).digest('hex')}`;
}
```

---

### `server/src/ingest/github.ts` + `server/src/ingest/local.ts` (ingest-adapters)

**Analog:** [RESEARCH §Pattern 6] — both blocks verbatim.

**GitHub path** (lines from RESEARCH):

```typescript
import { execa } from 'execa';
export async function ingestGithub(numberOrUrl: string) {
  const [metaRaw, diffRaw] = await Promise.all([
    execa('gh', ['pr', 'view', String(numberOrUrl),
      '--json', 'title,body,author,baseRefName,headRefName,baseRefOid,headRefOid,additions,deletions,changedFiles'
    ]),
    execa('gh', ['pr', 'diff', String(numberOrUrl)]),
  ]);
  return { meta: JSON.parse(metaRaw.stdout), diffText: diffRaw.stdout };
}
```

**Local path** (lines from RESEARCH):

```typescript
import { execa } from 'execa';
export async function ingestLocal(base: string, head: string, cwd: string) {
  await Promise.all([
    execa('git', ['rev-parse', '--verify', base], { cwd }),
    execa('git', ['rev-parse', '--verify', head], { cwd }),
  ]);
  const { stdout } = await execa('git', ['diff', `${base}...${head}`], { cwd });   // 3-dot merge-base (GitHub parity)
  return { diffText: stdout };
}
```

**Citation:** [RESEARCH §Pattern 6] + [D-15, D-16] + [INGEST-01, INGEST-02].

**Error-handling rule:** On `gh` failure, parse stderr for known patterns (e.g., "gh auth login", "no default repository") and return a friendly tool error. See [RESEARCH §Pitfall 4].

---

### `server/src/ingest/parse.ts` (diff-shaper, transform)

**Analog:** [RESEARCH §Pattern 6 — parse shape per D-17]. Code shape is verbatim.

**Full pattern** (~20 lines):

```typescript
import parseDiff from 'parse-diff';
import { createHash } from 'node:crypto';

export function toDiffModel(diffText: string): DiffModel {
  const files = parseDiff(diffText);
  return {
    files: files.map((f, fi) => {
      const path = f.to ?? f.from ?? 'unknown';
      const fileId = createHash('sha1').update(path).digest('hex').slice(0, 12);
      return {
        id: fileId, path,
        oldPath: f.from !== f.to ? f.from : undefined,
        status: f.deleted ? 'deleted' : f.new ? 'added' : f.renamed ? 'renamed' : 'modified',
        binary: f.chunks.length === 0,
        hunks: f.chunks.map((c, hi) => ({
          id: `${fileId}:h${hi}`,                       // OPAQUE HUNK ID — D-17 (don't retrofit Phase 5)
          header: c.content,
          lines: c.changes.map((ch, li) => lineFromChange(ch, `${fileId}:h${hi}:l${li}`)),
        })),
      };
    }),
    totalHunks: files.reduce((sum, f) => sum + f.chunks.length, 0),
  };
}
```

**Citation:** [RESEARCH §Pattern 6] + [D-17].

**Load-bearing detail:** `Hunk.id = ${fileId}:h${index}` MUST be populated in Phase 1 even though no tool exposes it yet. Phase 5's `show_hunk` tool depends on this. Unit test at `parse.test.ts` enforces.

**`lineFromChange` helper** (write once, not in RESEARCH — derive from `parse-diff` Change shape):

Each `DiffLine` carries: `{ kind: 'add'|'del'|'context', side: 'LEFT'|'RIGHT'|'BOTH', fileLine: number, diffPosition: number, text: string, id: string }`. Both `fileLine` AND `diffPosition` must be preserved ([RESEARCH §State of the Art]).

---

### `server/src/highlight/shiki.ts` (highlighter + LRU cache)

**Analog:** [RESEARCH §Pattern 7: Shiki Server-Side Highlighting with LRU Cache]. Code shape is verbatim.

**Full pattern** (~16 lines):

```typescript
import { createHighlighter } from 'shiki';

let hl: Awaited<ReturnType<typeof createHighlighter>> | null = null;
const cache = new Map<string, HunkTokens[]>();

async function getHighlighter() {
  if (!hl) hl = await createHighlighter({
    themes: ['github-dark'],
    langs: ['typescript','javascript','tsx','jsx','json','md','css','html','bash','python','go','rust'],
  });
  return hl;
}

export async function highlightHunks(filePath: string, headSha: string, hunks: Hunk[]): Promise<HunkTokens[]> {
  const key = `${filePath}@${headSha}`;
  if (cache.has(key)) return cache.get(key)!;
  const h = await getHighlighter();
  const lang = detectLang(filePath);    // fallback 'plaintext'
  const tokens = hunks.map((hunk) =>
    hunk.lines.map((line) => h.codeToTokensBase(line.text, { lang, theme: 'github-dark' }))
  );
  cache.set(key, tokens);
  return tokens;
}
```

**Citation:** [RESEARCH §Pattern 7] + [Context7 `/shikijs/shiki`] + [D-22].

**Flagged risk:** `@git-diff-view/react@0.1.3`'s token hook API not yet verified ([RESEARCH §Pitfall 7, §Open Question 1]). Before wiring, write the 20-line spike in `web/src/components/DiffView.spike.tsx` to confirm API shape.

---

### `server/src/persist/paths.ts` + `server/src/persist/store.ts`

**Analog:** [RESEARCH §Don't Hand-Roll: atomic file writes + cross-process locks] + npm READMEs for `write-file-atomic` and `proper-lockfile`.

**Paths pattern** (DESIGN-FROM-SCRATCH, contract from [D-05] + [RESEARCH §Pitfall 5]):

```typescript
import path from 'node:path';
export function stateFilePath(prKey: string): string {
  const base = process.env.CLAUDE_PLUGIN_DATA ?? path.resolve('.planning/.cache');   // dev fallback
  if (!process.env.CLAUDE_PLUGIN_DATA) logger.warn('CLAUDE_PLUGIN_DATA unset; using ' + base);
  return path.join(base, 'reviews', prKey.replace(/[/#:]/g, '_'), 'state.json');     // sanitize pr-key → path
}
```

**Store pattern** (thin wrapper):

```typescript
import writeFileAtomic from 'write-file-atomic';
import lockfile from 'proper-lockfile';

export async function writeState(prKey: string, data: object): Promise<void> {
  const file = stateFilePath(prKey);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const release = await lockfile.lock(file, { retries: 3, realpath: false });
  try {
    await writeFileAtomic(file, JSON.stringify(data, null, 2));
  } finally {
    await release();
  }
}
```

**Citation:** [RESEARCH §Don't Hand-Roll] + [D-04, D-05, D-06] + [npm `write-file-atomic` README "Atomic, fault-tolerant writes"] + [npm `proper-lockfile` README "graceful stale-lock handling"].

**Phase-1 rule:** Write once per `start_review` ([D-06]). Per-mutation event-sourced writes are Phase 2.

---

### `server/src/browser-launch.ts` (utility, side-effect)

**Analog:** [RESEARCH §System Architecture browser-launch arrow] + [D-13, PLUG-03].

**Full pattern** (DESIGN-FROM-SCRATCH, ~6 lines):

```typescript
import open from 'open';

export async function launchBrowser(url: string): Promise<void> {
  // STDERR FIRST — D-13 mandate. `open` on macOS doesn't reliably surface launch failure.
  logger.info(`Open this URL in your browser if it didn't launch automatically: ${url}`);
  try { await open(url); } catch (err) { logger.warn('open() failed; URL above remains valid', err); }
}
```

**Hard rule:** Stderr echo MUST happen BEFORE the `open` call, not after. Test at `browser-launch.test.ts` asserts ordering by capturing stderr writes.

**Citation:** [D-13] + [RESEARCH §Pitfall — always-print pattern] + [PLUG-03].

---

### `web/index.html` (html-entry, template)

**Analog:** [RESEARCH §Pitfall 9] + [UI-SPEC §CSP Compatibility].

**Full pattern** (~12 lines):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Git Review</title>
    <link rel="stylesheet" href="/assets/index.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx" nonce="__NONCE__"></script>
  </body>
</html>
```

**Citation:** [UI-SPEC §CSP Compatibility] + [RESEARCH §Pitfall 9].

**Hard rules:**
- Exactly one `<script>` tag. No inline scripts.
- `nonce="__NONCE__"` placeholder — Hono substitutes at serve time.
- Vite emits hashed `/assets/main-[hash].js` on build; we never touch `src`.

---

### `web/src/main.tsx` (web-bootstrap)

**Analog:** [RESEARCH §Example 3: Browser entry]. Code shape is verbatim.

**Full pattern** (~20 lines):

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

async function bootstrap() {
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  const sessionKey = params.get('session') ?? inferFromPath();
  if (!token) return renderFatal('Missing session token. Re-run /review.');

  const adoptRes = await fetch('/api/session/adopt', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }), credentials: 'same-origin',
  });
  if (!adoptRes.ok) return renderFatal('Session rejected. Re-run /review.');

  history.replaceState('', '', '/');                                       // wipe token from URL

  const es = new EventSource(`/api/events?session=${sessionKey}`, { withCredentials: true });
  es.addEventListener('snapshot', (ev) => renderApp(JSON.parse((ev as MessageEvent).data)));
  es.onerror = () => markSessionExpired();
}
bootstrap().catch((e) => renderFatal(e.message));
```

**Citation:** [RESEARCH §Example 3] + [D-09, D-10, D-02].

**Hard rule:** `history.replaceState` MUST run AFTER adopt success, BEFORE EventSource open. Leaking order would keep the token in history longer than necessary.

---

### `web/src/App.tsx` (root-component, state router) — DESIGN-FROM-SCRATCH

**Contract:** routes to one of four diff-canvas states based on session state ([D-24] + [UI-SPEC §Component Inventory §`<DiffCanvas>`]):

| State | Condition | Component |
|---|---|---|
| Loading | snapshot not yet received | `<LoadingState>` |
| Empty | snapshot received AND `diff.files.length === 0` | `<EmptyState>` |
| Error (server unreachable) | EventSource `onerror` OR adopt rejected | `<ErrorState variant="unreachable">` |
| Error (diff fetch failed) | snapshot received with `session.error` set | `<ErrorState variant="fetch-failed">` |
| DiffLoaded | snapshot received AND `diff.files.length > 0` | `<DiffView>` |

**Shape:**

```tsx
export default function App({ state }: { state: AppState }) {
  return (
    <AppShell>
      <AppHeader pr={state.pr} session={state.session} />
      <DiffCanvas>
        {state.phase === 'loading' && <LoadingState />}
        {state.phase === 'empty' && <EmptyState />}
        {state.phase === 'error' && <ErrorState variant={state.errorVariant} />}
        {state.phase === 'diff' && <DiffView model={state.diff} tokens={state.shikiTokens} />}
      </DiffCanvas>
      <AppFooter url={state.launchUrl} token={state.tokenLast4} sessionActive={state.session.active} />
    </AppShell>
  );
}
```

**Citation:** [UI-SPEC §Component Inventory] + [UI-SPEC §Copywriting Contract] + [D-24].

---

### `web/src/components/*.tsx` (UI-SPEC-driven, 9 files)

All UI components map 1:1 to sections in `01-UI-SPEC.md`. The UI-SPEC is the contract source. Summary:

| Component | UI-SPEC Section | Critical Contract |
|---|---|---|
| `AppShell` | §`<AppShell>` | 3-slot: header/main/footer; main overflow-y auto; bg `--color-surface` |
| `AppHeader` | §`<AppHeader>` | 48px fixed; `--color-surface-raised`; 1px bottom border `--color-border`; padding 0 `lg` |
| `AppFooter` | §`<AppFooter>` | 28px fixed; click-to-copy on local URL via `navigator.clipboard.writeText` |
| `SessionStatusPill` | §`<SessionStatusPill>` | 2 states table (Active/Expired); `--color-accent-muted` vs `--color-destructive-muted` fills; Lucide `ShieldCheck`/`ShieldX` 12px |
| `DiffCanvas` | §`<DiffCanvas>` | flex-1 overflow-y auto; padding `lg` top/bottom, `xl` left/right ≥1280px, `md` <1280px |
| `DiffView` | §`<DiffView>` | wraps `@git-diff-view/react` `DiffView`; unified mode only (split is Phase 3); Shiki tokens via token-renderer hook |
| `LoadingState` | §`<LoadingState>` | single pulsing skeleton 80x4 px; border-radius 2px; NO spinner |
| `EmptyState` | §`<EmptyState>` | Lucide `GitCompareArrows` 24px; copy locked in §Copywriting Contract |
| `ErrorState` | §`<ErrorState>` | Lucide `AlertCircle` 24px `--color-destructive`; 2 copy variants; NO retry button |

**Copy contract:** All user-facing text is locked in `01-UI-SPEC.md §Copywriting Contract`. Do not paraphrase. Copy verbatim.

**Icons:** All from `lucide-react@1.8.0`. No custom SVGs. No icon fonts.

**No external component analog needed** — UI-SPEC is authoritative and each component is hand-rolled over Tailwind primitives per [UI-SPEC §Registry Safety].

---

### `web/src/index.css` (css-theme)

**Analog:** [UI-SPEC §Tailwind 4 Token Declarations]. Copy the `@theme {}` block verbatim.

**Pattern:** reproduce the 40-line `@theme { ... }` block from UI-SPEC (spacing xs..3xl, color-surface, color-border, color-accent, color-destructive, color-diff-*, color-text-*, font-sans, font-mono).

**Hard rule:** Only font *stacks* are tokenized. Weights applied via Tailwind utilities (`font-normal` = 400, `font-semibold` = 600). No third weight may leak in ([UI-SPEC §Typography]).

---

### `commands/review.md` (slash-command-prompt)

**Analog:** [RESEARCH §Example 1]. Copy verbatim.

**Full pattern:**

```markdown
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
```

**Citation:** [RESEARCH §Example 1] + [https://code.claude.com/docs/en/plugins-reference/ §commands].

---

### `.mcp.json` + `.claude-plugin/plugin.json`

**`.mcp.json`** at plugin root (NOT inside `.claude-plugin/` — documented common mistake):

```json
{
  "mcpServers": {
    "git-review-plugin": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/server/dist/index.js"],
      "env": {}
    }
  }
}
```

**`.claude-plugin/plugin.json`:**

```json
{
  "name": "git-review-plugin",
  "version": "0.1.0",
  "description": "Pair-review workflow with LLM in a local browser GUI",
  "author": { "name": "Connor Barr" },
  "commands": "./commands/",
  "mcpServers": "./.mcp.json"
}
```

**Citation:** [RESEARCH §Example 5, §Example 6] + [https://code.claude.com/docs/en/plugins-reference/].

**Hard rule:** `commands/` is at plugin root, NOT inside `.claude-plugin/`. [CLAUDE.md §What NOT to Use] — plugin won't load otherwise.

---

### `scripts/security-probes.sh` (validation-script)

**Analog:** [RESEARCH §Example 4: Required curl probes]. Reproduce verbatim; return non-zero on any failure.

**Full pattern:**

```bash
#!/usr/bin/env bash
set -euo pipefail
PORT="${1:?usage: $0 <port>}"

# Probe 1: 127.0.0.1 bind only
if curl -s --max-time 2 "http://0.0.0.0:$PORT/" >/dev/null 2>&1; then echo "FAIL: 0.0.0.0 reachable"; exit 1; fi

# Probe 2: Missing token → 403
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/events?session=test")
[[ "$code" == "403" ]] || { echo "FAIL: missing token got $code (want 403)"; exit 1; }

# Probe 3: Forged Host → 400 (DNS rebinding defense)
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: evil.com' "http://127.0.0.1:$PORT/")
[[ "$code" == "400" ]] || { echo "FAIL: forged Host got $code (want 400)"; exit 1; }

# Probe 4: CSP header present on GET /
csp=$(curl -sI "http://127.0.0.1:$PORT/" | grep -i 'content-security-policy' || true)
[[ -n "$csp" ]] || { echo "FAIL: no CSP header"; exit 1; }

echo "OK"
```

**Citation:** [RESEARCH §Example 4] + [ROADMAP Phase 1 success criterion #3].

---

## Shared Patterns

Cross-cutting patterns that apply to multiple files.

### Stderr-only logging (applies to EVERY server file)

**Source:** `server/src/logger.ts`
**Apply to:** All server files — MCP, HTTP, session, ingest, persist, browser-launch.
**Rule:** Import `logger` from `../logger.js` (path relative). Never call `console.log`.
**Enforcement:** ESLint `no-console: ["error", { allow: ["error", "warn"] }]` on `server/`.
**Citation:** [AP2] + [RESEARCH §Pitfall 1, severity BLOCKER].

### Zod input validation (applies to MCP tool + HTTP POST routes)

**Source:** [RESEARCH §Example 2] + [RESEARCH §Pattern 5 session-adopt]
**Apply to:** `server/src/mcp/tools/start-review.ts`, `server/src/http/routes/session-adopt.ts`, and every future HTTP POST route.
**Rule:** Define a `z.object({...})` schema, call `.safeParse(await c.req.json().catch(() => null))`, return `c.text('Bad request', 400)` on failure.
**Citation:** [RESEARCH §Don't Hand-Roll: MCP tool validation].

### Fail-closed short-circuit responses (applies to all middleware + auth-gated routes)

**Source:** [RESEARCH §Pattern 3, §Pattern 4] + [CONTEXT §specifics "fail-closed defaults"]
**Apply to:** All middleware, all routes that can reject.
**Rule:** Every auth/validation failure is a single short early-return with a specific status code:
- missing/bad token → 403
- wrong Host → 400
- missing request param → 400
- malformed body → 400 (from zod)
- unknown session → 404
**Rule:** No permissive middleware with late guards. Reject early, reject once.
**Citation:** [CONTEXT §specifics] + [RESEARCH §Risk Register].

### execa shell-out error friendliness (applies to all `gh`/`git` callers)

**Source:** [RESEARCH §Pitfall 4]
**Apply to:** `server/src/ingest/github.ts`, `server/src/ingest/local.ts`, `server/src/ingest/repo-infer.ts`.
**Rule:** Wrap each `execa()` call. On failure, parse `err.stderr` for known patterns, return a friendly message. Never surface raw gh/git output to the user.
**Citation:** [RESEARCH §Pitfall 4].

### Opaque-ID pre-population (applies to diff parser + shared types)

**Source:** [D-17] + [RESEARCH §Pattern 6]
**Apply to:** `server/src/ingest/parse.ts`, `shared/types.ts`.
**Rule:** `Hunk.id = ${fileId}:h${index}`, `DiffLine.id = ${fileId}:h${hunkIndex}:l${lineIndex}`. Populate in Phase 1 even though no tool exposes them yet. Phase 5's `show_hunk` tool depends on this — retrofitting costs a migration.
**Citation:** [D-17] + [PITFALLS.md §Pitfall 2 — Hallucinated coords].

### UI-SPEC copy verbatim (applies to all web components)

**Source:** [UI-SPEC §Copywriting Contract]
**Apply to:** All `web/src/components/*.tsx`.
**Rule:** Copy strings verbatim from UI-SPEC's copy table. Do not paraphrase. Do not add exclamation marks. All error states end with a concrete next step.
**Citation:** [UI-SPEC §Copywriting Contract §Tone].

### Tailwind 4 tokens only (applies to all styling)

**Source:** [UI-SPEC §Tailwind 4 Token Declarations]
**Apply to:** All `web/src/*.{tsx,css}`.
**Rule:** Only use tokens declared in `@theme {}` block. No new hex codes. No new spacing values. No new font weights beyond `font-normal` (400) and `font-semibold` (600).
**Citation:** [UI-SPEC §Typography, §Color, §Spacing].

### Pinned exact versions for young libraries (applies to `package.json` deps)

**Source:** [RESEARCH §Pitfall 3]
**Apply to:** `web/package.json`.
**Rule:** Pin `@git-diff-view/react` at exact `0.1.3`, not `^0.1.3`. Pre-1.0 → breaking changes between minors are possible. Upgrades are explicit decisions.
**Citation:** [RESEARCH §Pitfall 3].

---

## No Analog Found

Files where no close in-repo OR external code shape exists. Planner should design from scratch against the listed contract.

| File | Role | Governing Contract |
|---|---|---|
| `server/src/logger.ts` | stderr-only logger | [AP2] + [RESEARCH §Pitfall 1]. Contract: never touch stdout. |
| `server/src/session/manager.ts` | in-memory session singleton | [RESEARCH §System Architecture "SessionManager"] + [D-08, D-18, D-21]. Contract: idempotent `startReview`, single per-launch token, browser launch only on first call. |
| `server/src/session/key.ts` | pr-key derivation | [D-05]. Contract: `gh:<o>/<r>#<n>` or `local:<sha256(...)>`. |
| `server/src/persist/paths.ts` | path resolver with dev fallback | [D-05] + [RESEARCH §Pitfall 5]. Contract: read `CLAUDE_PLUGIN_DATA`, fallback to `.planning/.cache/reviews/` with warning. |
| `server/src/http/render-index.ts` | nonce-substitution template | [RESEARCH §Pitfall 9]. Contract: read `web/dist/index.html`, replace `__NONCE__`, preserve Vite's hashed `src=`. |
| `web/src/App.tsx` | 4-state router | [UI-SPEC §Component Inventory] + [D-24]. Contract: exactly 4 visual states per [UI-SPEC §`<DiffCanvas>`]. |
| `web/src/store.ts` | client state reducer | Planner's call per [CONTEXT "Claude's Discretion"]. Contract: must model the 4 phases (loading/empty/error/diff) and session-active boolean. |

For each of these, **the planner should write a task whose action section cites the contract directly and does not attempt to copy from a non-existent analog.**

---

## Weak-Pattern Flags (design-risk callouts)

Files where the external analog exists but has verified risk. Planner should allocate spike/buffer time.

| File | Risk | Source | Mitigation |
|---|---|---|---|
| `web/src/components/DiffView.tsx` | `@git-diff-view/react@0.1.3` is pre-1.0; token-hook API not verified against Shiki output | [RESEARCH §Pitfall 3, §Pitfall 7, §Open Question 1] | Wave-1 spike: `web/src/components/DiffView.spike.tsx` (20-line fixture) to confirm token hook shape before full wiring. Fallback library documented: `react-diff-viewer-continued@4.25.9`. |
| `server/src/highlight/shiki.ts` | Shiki `codeToTokensBase` output shape may not match `@git-diff-view/react` token hook expectations | [RESEARCH §Pitfall 7] | Isolate to one adapter file; planner can swap without touching callers if mismatch found. |
| `server/src/persist/paths.ts` | `CLAUDE_PLUGIN_DATA` unset in `claude --plugin-dir ./` dev workflow | [RESEARCH §Pitfall 5] | Dev fallback to `.planning/.cache/reviews/`; log warning once at boot. |
| `server/src/browser-launch.ts` | macOS `open` exits 0 regardless of actual launch outcome | [RESEARCH §Assumption A4] + [D-13] | Always-stderr-first pattern; don't try to detect success. |
| `server/src/http/middleware/token-validate.ts` | Plain `===` comparison on tokens is timing-attack-soft | [RESEARCH §Pattern 4 "Warning"] | Acceptable for Phase 1 given 256-bit entropy on localhost; flagged upgrade to `crypto.timingSafeEqual` in Phase 7 hardening. |
| `web/src/components/DiffView.tsx` (styling) | Shiki `github-dark` theme colors may clash with UI-SPEC `--color-diff-*` tokens | [RESEARCH §Assumption A9] | 1-2 hour spike at implementation to diff actual rendered colors against UI-SPEC tokens. |

---

## Metadata

**Analog search scope:**
- Repo directories: entire repo root (`ls -la` confirmed: only `.git/`, `.planning/`, `CLAUDE.md`).
- External specs consulted: `CLAUDE.md` (tech stack), `01-CONTEXT.md`, `01-RESEARCH.md`, `01-UI-SPEC.md`, Context7 references cited in RESEARCH (hono, MCP SDK, shiki, plugins-reference), npm README conventions for `write-file-atomic`, `proper-lockfile`, `parse-diff`, `@git-diff-view/react`.

**Files scanned in repo:** 0 source files (confirmed greenfield).

**External reference documents loaded:**
- `CLAUDE.md` (21 KB — full tech stack + anti-patterns)
- `.planning/phases/01-plugin-skeleton-secure-vertical-slice/01-CONTEXT.md` (full)
- `.planning/phases/01-plugin-skeleton-secure-vertical-slice/01-RESEARCH.md` (full, in 3 reads)
- `.planning/phases/01-plugin-skeleton-secure-vertical-slice/01-UI-SPEC.md` (full)

**Pattern extraction date:** 2026-04-16

**Confidence:** HIGH on all server-side files (RESEARCH supplies verbatim code shapes for 90% of them). HIGH on UI-SPEC-driven web components (UI-SPEC is the authoritative contract and was approved). MEDIUM on `DiffView.tsx` + `shiki.ts` integration due to pre-1.0 library risk (flagged for Wave-1 spike).

**Planner note:** Every "Citation" line in this document points to a heading that the planner should re-open when writing the implementation plan's action section. Do not summarize — paste the short excerpts as-is into plan tasks, prefixed with the file path and section heading so the executor can verify.
