import type {
  ReviewSession,
  PullRequestMeta,
  DiffModel,
  ShikiFileTokens,
  GitHubPrViewJson,
  SessionEvent,
} from '@shared/types';
import { githubKey, localKey } from './key.js';
import { writeState, readState } from '../persist/store.js';
import { launchBrowser } from '../browser-launch.js';
import { logger } from '../logger.js';
import { ingestGithub, fetchCurrentHeadSha as fetchGithubHeadSha } from '../ingest/github.js';
import { ingestLocal, fetchCurrentHeadSha as fetchLocalHeadSha } from '../ingest/local.js';
import { inferRepoFromCwd } from '../ingest/repo-infer.js';
import { toDiffModel } from '../ingest/parse.js';
import { highlightHunks } from '../highlight/shiki.js';
import { applyEvent as reduce } from './reducer.js';
import { SessionBus } from './bus.js';
import { promises as fs } from 'node:fs';
import { stateFilePath } from '../persist/paths.js';

export type SourceArg =
  | { kind: 'github'; url: string }
  | { kind: 'github'; number: number }
  | { kind: 'local'; base: string; head: string };

export class SessionManager {
  private sessionToken: string;
  private httpPort: number | null = null;
  private launchUrl = '';
  private sessions = new Map<string, ReviewSession>();
  private launched = new Set<string>(); // prKeys whose browser was already launched (D-21)
  private queues = new Map<string, Promise<unknown>>();
  public readonly bus = new SessionBus();

  constructor(opts: { sessionToken: string }) {
    this.sessionToken = opts.sessionToken;
  }

  getSessionToken(): string {
    return this.sessionToken;
  }

  getHttpPort(): number | null {
    return this.httpPort;
  }

  setHttpPort(port: number): void {
    this.httpPort = port;
  }

  setLaunchUrl(url: string): void {
    this.launchUrl = url;
  }

  getLaunchUrl(): string {
    return this.launchUrl;
  }

  getTokenLast4(): string {
    return this.sessionToken.slice(-4);
  }

  get(prKey: string): ReviewSession | undefined {
    return this.sessions.get(prKey);
  }

  /**
   * Real ingestion pipeline (Plan 04).
   * GitHub: gh pr view + gh pr diff → parse → Shiki highlight
   * Local: git rev-parse both refs + git diff base...head → parse → Shiki highlight
   * Idempotent per D-21: returns existing session on repeat call, no re-ingest, no browser re-launch.
   */
  async startReview(source: SourceArg): Promise<ReviewSession> {
    const prKey = await this.derivePrKey(source);

    // (1) Idempotency: return existing session, don't re-launch browser (D-21)
    const existing = this.sessions.get(prKey);
    if (existing) return existing;

    // (2) Phase 2 disk-load path: persisted state on disk, nothing in memory.
    const persistedRaw = await readState(prKey);
    if (persistedRaw) {
      const persisted = persistedRaw as Partial<ReviewSession> & Record<string, unknown>;
      // Legacy Phase-1 `state.json` may lack `lastEventId` — migrate forward.
      const migrated: ReviewSession = {
        ...(persisted as ReviewSession),
        lastEventId: typeof persisted.lastEventId === 'number' ? persisted.lastEventId : 0,
      };

      // Stale-diff detection (Pattern 4). Fail closed per Pitfall F: any error from
      // fetchCurrentHeadSha surfaces as session.error; do NOT default to "stale".
      let staleDiff: ReviewSession['staleDiff'];
      let headShaError: ReviewSession['error'] = null;
      try {
        const currentSha = await this.fetchCurrentHeadSha(source);
        if (currentSha !== migrated.headSha) {
          staleDiff = { storedSha: migrated.headSha, currentSha };
        }
      } catch (err) {
        headShaError = {
          variant: 'fetch-failed',
          message: `head-sha-check-failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      const session: ReviewSession = {
        ...migrated,
        staleDiff,
        error: headShaError,
      };
      this.sessions.set(prKey, session);
      if (!this.launched.has(prKey)) {
        this.launched.add(prKey);
        await launchBrowser(this.sessionLaunchUrl(prKey));
      }
      return session;
    }

    // (3) Fall-through: full ingest — original Phase-1 behavior
    let pr: PullRequestMeta;
    let diffText: string;

    if (source.kind === 'github') {
      const id = 'url' in source ? source.url : String(source.number);
      const { meta, diffText: dt } = await ingestGithub(id);
      diffText = dt;
      pr = this.githubMetaToPr(source, meta, prKey);
    } else {
      const cwd = process.cwd();
      const { diffText: dt, baseSha, headSha } = await ingestLocal(source.base, source.head, cwd);
      diffText = dt;
      pr = {
        source: 'local',
        title: `Local diff: ${source.base}..${source.head}`,
        description: `Comparing local refs ${source.base} and ${source.head}`,
        author: 'local',
        baseBranch: source.base,
        headBranch: source.head,
        baseSha,
        headSha,
        additions: 0,
        deletions: 0,
        filesChanged: 0,
      };
    }

    const diff: DiffModel = toDiffModel(diffText);

    // Compute stats from parsed diff (local-mode stats + GitHub parity check)
    if (pr.additions === 0 && pr.deletions === 0) {
      let additions = 0;
      let deletions = 0;
      for (const f of diff.files) {
        for (const h of f.hunks) {
          for (const l of h.lines) {
            if (l.kind === 'add') additions++;
            if (l.kind === 'del') deletions++;
          }
        }
      }
      pr = {
        ...pr,
        additions,
        deletions,
        filesChanged: diff.files.length,
      };
    }

    // Per-file Shiki highlighting (skip binary files)
    const shikiTokens: Record<string, ShikiFileTokens> = {};
    for (const file of diff.files) {
      if (file.binary) continue;
      shikiTokens[file.id] = await highlightHunks(
        file.path,
        pr.headSha || 'HEAD',
        file.hunks
      );
    }

    const session: ReviewSession = {
      prKey,
      pr,
      diff,
      shikiTokens,
      createdAt: new Date().toISOString(),
      headSha: pr.headSha,
      error: null,
      lastEventId: 0,
    };
    this.sessions.set(prKey, session);

    // Persist initial snapshot once (D-06 write-once)
    try {
      await writeState(prKey, session);
    } catch (err) {
      logger.warn('persist write failed', err);
    }

    // Launch browser only on first call for this prKey (D-21)
    if (!this.launched.has(prKey)) {
      this.launched.add(prKey);
      await launchBrowser(this.sessionLaunchUrl(prKey));
    }

    return session;
  }

  /**
   * THE ONE FUNNEL for Phase 2+ mutations. Persist-then-broadcast.
   *
   * Order:
   *   1. Serialize per-prKey via a Promise chain (closes Pitfall D)
   *   2. Read current session from in-memory Map
   *   3. Run pure reducer
   *   4. Increment lastEventId (reducer never touches the counter)
   *   5. Persist snapshot to disk (source of truth)
   *   6. Update in-memory Map
   *   7. Emit on bus (broadcast)
   *
   * Disk confirms BEFORE memory updates BEFORE broadcast. A crash between
   * 5 and 6 leaves disk ahead of memory — but memory is empty on restart
   * and gets repopulated via readState; zero drift.
   */
  async applyEvent(id: string, event: SessionEvent): Promise<ReviewSession> {
    const prev = this.queues.get(id) ?? Promise.resolve();
    const run = prev.then(async () => {
      const current = this.sessions.get(id);
      if (!current) throw new Error(`No session for prKey: ${id}`);
      const reduced = reduce(current, event);
      const next: ReviewSession = { ...reduced, lastEventId: current.lastEventId + 1 };
      await writeState(id, next); // disk first
      this.sessions.set(id, next); // memory second
      this.bus.emit('session:updated', { id, event, state: next }); // broadcast last
      return next;
    });
    // Save the chain without leaking rejections to subsequent callers
    this.queues.set(id, run.catch(() => undefined));
    return run;
  }

  /**
   * Concrete behavior for the `session.reset` resume choice.
   * Deletes state.json from disk, clears in-memory Map, then re-runs the full
   * ingest pipeline as if this were a first-ever startReview. Returns the fresh session.
   *
   * Called from the HTTP handler for POST /api/session/choose-resume { choice: 'reset' }.
   * NOT meant to be called directly by MCP tools — the user-initiated reset flow is HTTP-only.
   */
  async resetSession(prKey: string, source: SourceArg): Promise<ReviewSession> {
    // Delete the on-disk snapshot (best-effort — ENOENT is fine)
    try {
      await fs.unlink(stateFilePath(prKey));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('resetSession: failed to unlink state.json', err);
      }
    }
    this.sessions.delete(prKey);
    // Also reset launched marker so if something truly catastrophic happened we re-launch
    this.launched.delete(prKey);
    // Re-run full ingest via startReview — fall-through to path (3)
    return this.startReview(source);
  }

  /**
   * Route-to-ingest-adapter SHA lookup for Phase 2 stale-diff detection.
   * Each adapter is already fail-closed (Pitfall F); this only dispatches.
   */
  private async fetchCurrentHeadSha(source: SourceArg): Promise<string> {
    if (source.kind === 'github') {
      const id = 'url' in source ? source.url : String(source.number);
      return fetchGithubHeadSha(id);
    }
    return fetchLocalHeadSha(source.head, process.cwd());
  }

  /**
   * Per-session launch URL: base `?token=…` URL with `&session=<prKey>` appended.
   * The web bootstrap reads `?session=` to subscribe to /api/events; the base URL
   * built at server start does not yet know the session, so this is computed per
   * startReview call and used for both the browser launch and the SSE snapshot's
   * launchUrl field (so the footer shows the full copy-pasteable URL).
   */
  sessionLaunchUrl(prKey: string): string {
    return `${this.launchUrl}&session=${encodeURIComponent(prKey)}`;
  }

  private async derivePrKey(source: SourceArg): Promise<string> {
    if (source.kind === 'github' && 'url' in source) {
      const m = source.url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
      if (!m) throw new Error(`Invalid GitHub PR URL: ${source.url}`);
      return githubKey(m[1], m[2], parseInt(m[3], 10));
    }
    if (source.kind === 'github' && 'number' in source) {
      const { owner, name } = await inferRepoFromCwd(process.cwd());
      return githubKey(owner, name, source.number);
    }
    return localKey(process.cwd(), source.base, source.head);
  }

  private githubMetaToPr(
    source: Extract<SourceArg, { kind: 'github' }>,
    meta: GitHubPrViewJson,
    prKey: string
  ): PullRequestMeta {
    // Derive owner/repo/number from prKey (derivePrKey just built it)
    const m = prKey.match(/^gh:([^/]+)\/([^#]+)#(\d+)$/);
    return {
      source: 'github',
      title: meta.title,
      description: meta.body,
      author: meta.author.login,
      baseBranch: meta.baseRefName,
      headBranch: meta.headRefName,
      baseSha: meta.baseRefOid,
      headSha: meta.headRefOid,
      additions: meta.additions,
      deletions: meta.deletions,
      filesChanged: meta.changedFiles,
      owner: m?.[1],
      repo: m?.[2],
      number: m ? parseInt(m[3], 10) : undefined,
      url: 'url' in source ? source.url : undefined,
    };
  }
}
