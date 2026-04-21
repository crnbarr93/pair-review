import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { adoptSession, openEventStream, setReviewToken } from './api';
import type { ChooseResumeSource } from './api';
import { actions } from './store';
import App from './App';

function renderFatal(msg: string): void {
  const root = document.getElementById('root');
  if (root) root.textContent = msg;
}

/**
 * Reconstruct the source argument that would have been passed to the MCP
 * start_review tool, using only the prKey carried on the launch URL. Works
 * cleanly for GitHub PRs (prKey format `gh:owner/repo#number`).
 *
 * PHASE 2 LIMITATION: local-mode prKeys are sha-hashes of the cwd + refs and
 * therefore cannot recover base/head from the prKey alone. Returns an empty
 * local source as a best-effort placeholder; the server's zod schema for
 * choose-resume requires non-empty base/head so "Refresh to current PR" on
 * a local session may 400. "Discard session" still works.
 *
 * A future plan (Phase 2.1 or Phase 3) may widen the launchUrl to carry
 * `source=<b64>` so local mode can round-trip cleanly.
 */
export function sourceFromPrKey(prKey: string): ChooseResumeSource {
  const gh = prKey.match(/^gh:([^/]+)\/([^#]+)#(\d+)$/);
  if (gh) return { kind: 'github', number: parseInt(gh[3], 10) };
  return { kind: 'local', base: '', head: '' };
}

export async function bootstrap(): Promise<void> {
  const params = new URLSearchParams(location.search);
  let token = params.get('token');
  let sessionKey = params.get('session') ?? '';

  // On refresh: URL params are wiped, recover from sessionStorage
  if (!token) {
    token = sessionStorage.getItem('reviewToken');
    sessionKey = sessionStorage.getItem('reviewSession') ?? '';
  }

  if (!token) return renderFatal('Missing session token. Re-run /review.');

  // Capture token + source from URL BEFORE history.replaceState wipes them.
  // Order is load-bearing: T-2-04-03 (token-leak mitigation) requires that
  // the in-memory capture happens first, so after the URL wipe there is no
  // path for the launch token to be recovered.
  setReviewToken(token);
  actions.setSource(sourceFromPrKey(sessionKey));

  const ok = await adoptSession(token);
  if (!ok) {
    actions.onAdoptFailed('unreachable');
    return renderFatal('Session rejected. Re-run /review.');
  }

  // Persist to sessionStorage so browser refresh can reconnect without re-running /review.
  // sessionStorage is tab-scoped and cleared on tab close — no cross-tab leak.
  sessionStorage.setItem('reviewToken', token);
  sessionStorage.setItem('reviewSession', sessionKey);

  // T-03 TOKEN LEAK MITIGATION: wipe query BEFORE opening EventSource or painting anything
  history.replaceState('', '', '/');

  openEventStream(
    sessionKey,
    (msg) => actions.onSnapshot(msg),
    (msg) => {
      if (msg.event?.type === 'selfReview.set') {
        actions.onSelfReviewSet(msg);
      } else if (msg.event?.type === 'summary.set') {
        actions.onSummarySet(msg);
      } else {
        actions.onUpdate(msg);
      }
    },
    () => actions.onSessionExpired()
  );

  // Paint shell immediately — store starts in phase:'loading' so skeleton renders
  const rootEl = document.getElementById('root');
  if (rootEl) {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  }
}

// Only auto-run in browser (not in tests — tests set window.__TEST__ = true)
if (typeof window !== 'undefined' && !(window as Window & { __TEST__?: boolean }).__TEST__) {
  bootstrap().catch((e: Error) => renderFatal(e.message));
}
