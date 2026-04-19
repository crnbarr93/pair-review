// Seed data for the Claude Pair Review prototype port.
// Mirrors the design handoff bundle's data.jsx. All fixtures — no live wire yet.

export interface PRMeta {
  repo: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  commits: number;
  files: number;
  additions: number;
  deletions: number;
}

export type StageStatus = 'done' | 'active' | 'pending';

export interface Stage {
  id: string;
  label: string;
  sub: string;
  status: StageStatus;
}

export type FileExt = 'ts' | 'tsx' | 'js' | 'json' | 'md' | 'css';

export interface RepoFileNode {
  type: 'file';
  path: string;
  ext: FileExt;
  changed?: boolean;
  added?: boolean;
}

export interface RepoFolderNode {
  type: 'folder';
  name: string;
  open?: boolean;
  children: RepoNode[];
}

export type RepoNode = RepoFileNode | RepoFolderNode;

export type FileReviewStatus = 'reviewed' | 'threads' | 'pending' | 'new';

export interface FileReviewState {
  status: FileReviewStatus;
  threads: number;
  adds: number;
  dels: number;
  added?: boolean;
}

export type DiffRowType = 'context' | 'add' | 'rem';

export interface DiffRow {
  type: DiffRowType;
  oldN: number | null;
  newN: number | null;
  text: string;
  threadIds?: string[];
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  rows: DiffRow[];
}

export interface DiffModelFixture {
  path: string;
  oldPath: string;
  language: string;
  hunks: DiffHunk[];
}

export type ThreadStatus = 'blocker' | 'warn' | 'open' | 'resolved';
export type MessageAuthor = 'claude' | 'me';

export interface Suggestion {
  file: string;
  lines: string;
  before: string;
  after: string;
}

export interface ThreadMessage {
  who: MessageAuthor;
  time: string;
  text: string;
  suggestion?: Suggestion;
}

export interface Thread {
  id: string;
  status: ThreadStatus;
  lineNew: number;
  stage: string;
  messages: ThreadMessage[];
}

export interface ThreadIndexEntry {
  id: string;
  file: string;
  line: number;
  status: ThreadStatus;
  preview: string;
  stage: string;
}

export type BulletIconKind = 'blocker' | 'warn' | 'ok' | 'info';

export interface ChatBullet {
  icon: BulletIconKind;
  text: string;
}

export interface ChatPlanStep {
  label: string;
  status: StageStatus;
  note?: string;
}

export interface ChatMessageFixture {
  who: MessageAuthor;
  time: string;
  paragraphs?: string[];
  plan?: ChatPlanStep[];
  bullets?: ChatBullet[];
  threadRef?: string;
  chips?: string[];
}

// ================================
// PR metadata
// ================================
export const PR: PRMeta = {
  repo: 'acme/platform-api',
  number: 2841,
  title: 'Add rate-limited auth middleware + refresh-token rotation',
  author: 'maya.chen',
  branch: 'feat/auth-rate-limit',
  base: 'main',
  commits: 7,
  files: 6,
  additions: 284,
  deletions: 47,
};

// ================================
// Review stages
// ================================
export const STAGES: Stage[] = [
  { id: 'overview', label: 'Overview', sub: 'Context & goals', status: 'done' },
  { id: 'security', label: 'Security', sub: '4 findings', status: 'done' },
  { id: 'correctness', label: 'Correctness', sub: '2 open', status: 'active' },
  { id: 'style', label: 'Style & API', sub: 'Not started', status: 'pending' },
  { id: 'tests', label: 'Tests & Docs', sub: 'Not started', status: 'pending' },
];

// ================================
// Repo tree
// ================================
export const REPO_TREE: RepoNode[] = [
  {
    type: 'folder',
    name: 'src',
    open: true,
    children: [
      {
        type: 'folder',
        name: 'middleware',
        open: true,
        children: [
          { type: 'file', path: 'src/middleware/auth.ts', ext: 'ts', changed: true },
          { type: 'file', path: 'src/middleware/rate-limit.ts', ext: 'ts', changed: true, added: true },
          { type: 'file', path: 'src/middleware/logger.ts', ext: 'ts' },
          { type: 'file', path: 'src/middleware/cors.ts', ext: 'ts' },
        ],
      },
      {
        type: 'folder',
        name: 'routes',
        open: true,
        children: [
          { type: 'file', path: 'src/routes/auth.ts', ext: 'ts', changed: true },
          { type: 'file', path: 'src/routes/users.ts', ext: 'ts' },
          { type: 'file', path: 'src/routes/index.ts', ext: 'ts' },
        ],
      },
      {
        type: 'folder',
        name: 'lib',
        open: false,
        children: [
          { type: 'file', path: 'src/lib/tokens.ts', ext: 'ts', changed: true },
          { type: 'file', path: 'src/lib/redis.ts', ext: 'ts' },
          { type: 'file', path: 'src/lib/db.ts', ext: 'ts' },
        ],
      },
      { type: 'file', path: 'src/server.ts', ext: 'ts' },
      { type: 'file', path: 'src/config.ts', ext: 'ts', changed: true },
    ],
  },
  {
    type: 'folder',
    name: 'test',
    open: false,
    children: [
      { type: 'file', path: 'test/auth.test.ts', ext: 'ts', changed: true, added: true },
      { type: 'file', path: 'test/users.test.ts', ext: 'ts' },
    ],
  },
  { type: 'file', path: 'package.json', ext: 'json' },
  { type: 'file', path: 'tsconfig.json', ext: 'json' },
  { type: 'file', path: 'README.md', ext: 'md' },
];

// ================================
// Per-file review state
// ================================
export const FILE_STATE: Record<string, FileReviewState> = {
  'src/middleware/auth.ts': { status: 'threads', threads: 3, adds: 42, dels: 18 },
  'src/middleware/rate-limit.ts': { status: 'threads', threads: 2, adds: 87, dels: 0, added: true },
  'src/routes/auth.ts': { status: 'reviewed', threads: 0, adds: 56, dels: 24 },
  'src/lib/tokens.ts': { status: 'threads', threads: 1, adds: 38, dels: 5 },
  'src/config.ts': { status: 'pending', threads: 0, adds: 12, dels: 0 },
  'test/auth.test.ts': { status: 'pending', threads: 0, adds: 49, dels: 0, added: true },
};

// ================================
// Current open file's diff
// ================================
export const AUTH_DIFF: DiffModelFixture = {
  path: 'src/middleware/auth.ts',
  oldPath: 'src/middleware/auth.ts',
  language: 'TypeScript',
  hunks: [
    {
      header: '@@ -1,24 +1,38 @@',
      oldStart: 1,
      newStart: 1,
      rows: [
        { type: 'context', oldN: 1, newN: 1, text: `import { Request, Response, NextFunction } from "express";` },
        { type: 'rem', oldN: 2, newN: null, text: `import jwt from "jsonwebtoken";` },
        { type: 'add', oldN: null, newN: 2, text: `import { verifyAccessToken, TokenError } from "../lib/tokens";` },
        { type: 'add', oldN: null, newN: 3, text: `import { rateLimit } from "./rate-limit";` },
        { type: 'context', oldN: 3, newN: 4, text: `` },
        { type: 'rem', oldN: 4, newN: null, text: `const SECRET = process.env.JWT_SECRET || "dev-secret";` },
        { type: 'context', oldN: 5, newN: 5, text: `` },
        { type: 'rem', oldN: 6, newN: null, text: `export function requireAuth(req: Request, res: Response, next: NextFunction) {` },
        { type: 'add', oldN: null, newN: 6, text: `export interface AuthedRequest extends Request {` },
        { type: 'add', oldN: null, newN: 7, text: `  userId: string;` },
        { type: 'add', oldN: null, newN: 8, text: `  scopes: string[];` },
        { type: 'add', oldN: null, newN: 9, text: `}` },
        { type: 'add', oldN: null, newN: 10, text: `` },
        { type: 'add', oldN: null, newN: 11, text: `export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {` },
        { type: 'context', oldN: 7, newN: 12, text: `  const header = req.headers.authorization;` },
        { type: 'rem', oldN: 8, newN: null, text: `  if (!header) return res.status(401).send("no auth");` },
        { type: 'add', oldN: null, newN: 13, text: `  if (!header?.startsWith("Bearer ")) {`, threadIds: ['t1'] },
        { type: 'add', oldN: null, newN: 14, text: `    return res.status(401).json({ error: "missing_bearer_token" });` },
        { type: 'add', oldN: null, newN: 15, text: `  }` },
        { type: 'context', oldN: 9, newN: 16, text: `` },
        { type: 'rem', oldN: 10, newN: null, text: `  const token = header.replace("Bearer ", "");` },
        { type: 'rem', oldN: 11, newN: null, text: `  try {` },
        { type: 'rem', oldN: 12, newN: null, text: `    const payload = jwt.verify(token, SECRET) as any;` },
        { type: 'rem', oldN: 13, newN: null, text: `    (req as any).userId = payload.sub;` },
        { type: 'rem', oldN: 14, newN: null, text: `    next();` },
        { type: 'rem', oldN: 15, newN: null, text: `  } catch (e) {` },
        { type: 'rem', oldN: 16, newN: null, text: `    res.status(401).send("bad token");` },
        { type: 'rem', oldN: 17, newN: null, text: `  }` },
        { type: 'add', oldN: null, newN: 17, text: `  const token = header.slice(7);`, threadIds: ['t2'] },
        { type: 'add', oldN: null, newN: 18, text: `  try {` },
        { type: 'add', oldN: null, newN: 19, text: `    const payload = await verifyAccessToken(token);` },
        { type: 'add', oldN: null, newN: 20, text: `    req.userId = payload.sub;` },
        { type: 'add', oldN: null, newN: 21, text: `    req.scopes = payload.scopes ?? [];` },
        { type: 'add', oldN: null, newN: 22, text: `    return next();` },
        { type: 'add', oldN: null, newN: 23, text: `  } catch (e) {` },
        { type: 'add', oldN: null, newN: 24, text: `    if (e instanceof TokenError && e.code === "expired") {`, threadIds: ['t3'] },
        { type: 'add', oldN: null, newN: 25, text: `      return res.status(401).json({ error: "token_expired" });` },
        { type: 'add', oldN: null, newN: 26, text: `    }` },
        { type: 'add', oldN: null, newN: 27, text: `    return res.status(401).json({ error: "invalid_token" });` },
        { type: 'add', oldN: null, newN: 28, text: `  }` },
        { type: 'context', oldN: 18, newN: 29, text: `}` },
      ],
    },
    {
      header: '@@ -22,3 +33,6 @@',
      oldStart: 22,
      newStart: 33,
      rows: [
        { type: 'context', oldN: 22, newN: 33, text: `` },
        { type: 'context', oldN: 23, newN: 34, text: `export function requireScope(scope: string) {` },
        { type: 'add', oldN: null, newN: 35, text: `  return (req: AuthedRequest, res: Response, next: NextFunction) => {` },
        { type: 'add', oldN: null, newN: 36, text: `    if (!req.scopes.includes(scope)) return res.status(403).end();` },
        { type: 'add', oldN: null, newN: 37, text: `    return next();` },
        { type: 'add', oldN: null, newN: 38, text: `  };` },
        { type: 'context', oldN: 24, newN: 39, text: `}` },
      ],
    },
  ],
};

// ================================
// Threads
// ================================
export const THREADS: Record<string, Thread> = {
  t1: {
    id: 't1',
    status: 'warn',
    lineNew: 13,
    stage: 'security',
    messages: [
      {
        who: 'claude',
        time: '2m ago',
        text: 'Good move requiring the `Bearer ` prefix — prevents someone passing a raw token through. One concern: the check is case-sensitive. RFC 6750 says the scheme is case-insensitive, so `bearer` or `BEARER` clients will 401. Should we normalize?',
      },
      { who: 'me', time: '1m ago', text: 'Hm, do any of our clients actually send lowercase?' },
      {
        who: 'claude',
        time: 'just now',
        text: 'The iOS SDK (v2.3) and the old Python client both send `bearer ` lowercase — I searched `platform-sdk-ios` and `py-client`. Suggesting a fix below.',
        suggestion: {
          file: 'src/middleware/auth.ts',
          lines: '13',
          before: `  if (!header?.startsWith("Bearer ")) {`,
          after: `  if (!header?.toLowerCase().startsWith("bearer ")) {`,
        },
      },
    ],
  },
  t2: {
    id: 't2',
    status: 'blocker',
    lineNew: 17,
    stage: 'security',
    messages: [
      {
        who: 'claude',
        time: '3m ago',
        text: "**Blocker.** `header.slice(7)` assumes exactly one space after `Bearer`. If a client sends `Bearer  <token>` (two spaces, seen in some proxies), you'll verify `' <token>'` which will always fail — but more importantly the regex-less slice is fragile. Also: no length bound — a 50MB header becomes a 50MB token string passed to `verifyAccessToken`.",
      },
      {
        who: 'claude',
        time: '3m ago',
        text: 'Recommend: split on whitespace and cap token length at 4096 chars.',
        suggestion: {
          file: 'src/middleware/auth.ts',
          lines: '17',
          before: `  const token = header.slice(7);`,
          after: `  const token = header.split(/\\s+/)[1]?.trim();\n  if (!token || token.length > 4096) {\n    return res.status(401).json({ error: "invalid_token" });\n  }`,
        },
      },
    ],
  },
  t3: {
    id: 't3',
    status: 'open',
    lineNew: 24,
    stage: 'correctness',
    messages: [
      {
        who: 'claude',
        time: '1m ago',
        text: 'When a token is expired, a well-behaved client should refresh and retry. Right now you return 401 with no hint. Two options: (a) add `WWW-Authenticate: Bearer error="invalid_token", error_description="token expired"` per RFC 6750 §3, or (b) a custom header `X-Token-Refresh: true`. (a) is the standard — I\'d go with that.',
      },
    ],
  },
};

// ================================
// Threads index
// ================================
export const THREAD_INDEX: ThreadIndexEntry[] = [
  { id: 't1', file: 'src/middleware/auth.ts', line: 13, status: 'warn', preview: 'Case-sensitive Bearer check', stage: 'security' },
  { id: 't2', file: 'src/middleware/auth.ts', line: 17, status: 'blocker', preview: 'Fragile token extraction + no length bound', stage: 'security' },
  { id: 't3', file: 'src/middleware/auth.ts', line: 24, status: 'open', preview: 'Return WWW-Authenticate on expired', stage: 'correctness' },
  { id: 't4', file: 'src/middleware/rate-limit.ts', line: 31, status: 'open', preview: 'Race condition in token bucket refill', stage: 'correctness' },
  { id: 't5', file: 'src/middleware/rate-limit.ts', line: 58, status: 'open', preview: 'IP-based keys are IPv6-unsafe', stage: 'security' },
  { id: 't6', file: 'src/lib/tokens.ts', line: 42, status: 'resolved', preview: 'Clock skew tolerance', stage: 'security' },
];

// ================================
// Chat transcript
// ================================
export const CHAT: ChatMessageFixture[] = [
  {
    who: 'claude',
    time: '4m ago',
    paragraphs: [
      "I've done a first pass on this PR. Rate limiting and refresh rotation are the right call — here's the plan I'd like to walk through with you:",
    ],
    plan: [
      { label: 'Overview', status: 'done' },
      { label: 'Security', status: 'done', note: '4 findings — 1 blocker, 2 warnings, 1 nit' },
      { label: 'Correctness', status: 'active', note: '2 open — race condition + error handling' },
      { label: 'Style & API', status: 'pending' },
      { label: 'Tests & Docs', status: 'pending' },
    ],
  },
  {
    who: 'claude',
    time: '3m ago',
    paragraphs: ['Finished the security pass. Summary:'],
    bullets: [
      { icon: 'blocker', text: '**Blocker** — token extraction is fragile (src/middleware/auth.ts:17)' },
      { icon: 'warn', text: 'Bearer prefix check is case-sensitive (src/middleware/auth.ts:13)' },
      { icon: 'warn', text: 'Rate-limit keys use raw IP — breaks for IPv6 (rate-limit.ts:58)' },
      { icon: 'ok', text: 'Clock skew tolerance looks good now (tokens.ts:42)' },
    ],
    threadRef: 't2',
  },
  {
    who: 'me',
    time: '2m ago',
    paragraphs: [
      "Accepted the token-extraction fix. Let's move to correctness — start with the rate-limiter race condition.",
    ],
  },
  {
    who: 'claude',
    time: '1m ago',
    paragraphs: [
      'Moving to correctness. Two things to discuss:',
      '**1.** The token-bucket in `rate-limit.ts` reads the current count and writes back without a Redis transaction. Under burst load two requests can both see `count=99` and both pass, letting 101 through a limit of 100. I\'d use `INCR` with expiry, or a Lua script for atomicity.',
      '**2.** On expired access tokens, we 401 silently. Per RFC 6750 we should set `WWW-Authenticate: Bearer error="invalid_token"` so clients know to refresh.',
    ],
    chips: ['Show me the race', 'Draft the Lua script', 'Why WWW-Authenticate?'],
  },
];
