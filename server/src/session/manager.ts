import type { ReviewSession, PullRequestMeta, DiffModel } from '@shared/types';
import { githubKey, localKey } from './key.js';
import { writeState } from '../persist/store.js';
import { launchBrowser } from '../browser-launch.js';
import { logger } from '../logger.js';

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
   * PHASE-1 STUB (D-06 / D-18 / D-21).
   * Plan 04 replaces the ingest/parse/highlight body. This version constructs a
   * minimal ReviewSession from the source argument so Plans 03 and 05 can
   * integration-test against the transport/UI layer.
   */
  async startReview(source: SourceArg): Promise<ReviewSession> {
    const prKey = this.derivePrKey(source);

    // Idempotency: return existing session, don't re-launch browser (D-21)
    const existing = this.sessions.get(prKey);
    if (existing) return existing;

    // Minimal Phase-1 stub — Plan 04 fills real ingest/parse/highlight
    const pr: PullRequestMeta = this.stubMetaFromSource(source);
    const diff: DiffModel = { files: [], totalHunks: 0 };
    const session: ReviewSession = {
      prKey,
      pr,
      diff,
      shikiTokens: {},
      createdAt: new Date().toISOString(),
      headSha: pr.headSha,
      error: null,
    };

    this.sessions.set(prKey, session);

    // Persist initial snapshot (D-06 write-once)
    try {
      await writeState(prKey, session);
    } catch (err) {
      logger.warn('persist write failed', err);
    }

    // Launch browser only on first call for this prKey
    if (!this.launched.has(prKey)) {
      this.launched.add(prKey);
      await launchBrowser(this.launchUrl);
    }

    return session;
  }

  private derivePrKey(source: SourceArg): string {
    if (source.kind === 'github' && 'url' in source) {
      // Parse owner/repo/number from URL — minimal defensive parse
      const m = source.url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
      if (!m) throw new Error(`Invalid GitHub PR URL: ${source.url}`);
      return githubKey(m[1], m[2], parseInt(m[3], 10));
    }
    if (source.kind === 'github' && 'number' in source) {
      // Plan 04 will repo-infer from cwd. Phase-1 stub uses placeholder.
      return githubKey('stub-owner', 'stub-repo', source.number);
    }
    return localKey(process.cwd(), source.base, source.head);
  }

  private stubMetaFromSource(source: SourceArg): PullRequestMeta {
    if (source.kind === 'local') {
      return {
        source: 'local',
        title: `Local diff: ${source.base}..${source.head}`,
        description: '(Plan 04 replaces this stub with real git diff)',
        author: 'local',
        baseBranch: source.base,
        headBranch: source.head,
        baseSha: '',
        headSha: '',
        additions: 0,
        deletions: 0,
        filesChanged: 0,
      };
    }
    return {
      source: 'github',
      title: 'GitHub PR (Plan 04 replaces stub with real `gh pr view`)',
      description: '',
      author: 'unknown',
      baseBranch: 'main',
      headBranch: 'head',
      baseSha: '',
      headSha: '',
      additions: 0,
      deletions: 0,
      filesChanged: 0,
      number: 'number' in source ? source.number : undefined,
      url: 'url' in source ? source.url : undefined,
    };
  }
}
