import type { SessionEvent, SnapshotMessage, UpdateMessage } from '@shared/types';

/**
 * Choice triad for the Phase 2 stale-diff modal. Mirrors the server's zod
 * enum in server/src/http/routes/session-resume.ts.
 */
export type ChooseResumeChoice = 'adopt' | 'reset' | 'viewBoth';

/**
 * Source descriptor sent back to the server for the adopt branch (and carried
 * through the other branches for consistency). Mirrors the discriminated union
 * accepted by POST /api/session/choose-resume.
 *
 * Note: for a local-mode prKey the client cannot recover base/head purely from
 * the prKey (it is a hash); see sourceFromPrKey in main.tsx for the documented
 * Phase-2 limitation.
 */
export interface ChooseResumeSource {
  kind: 'github' | 'local';
  url?: string;
  number?: number;
  base?: string;
  head?: string;
}

/**
 * Module-level token capture. main.tsx calls setReviewToken(token) with the
 * URL-borne launch token BEFORE history.replaceState wipes the URL. After the
 * wipe, the token only exists in this closure.
 *
 * NOT exported as a mutable variable — callers use setReviewToken + chooseResume.
 */
let reviewToken = '';

export function setReviewToken(token: string): void {
  reviewToken = token;
}

export async function adoptSession(token: string): Promise<boolean> {
  const res = await fetch('/api/session/adopt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    credentials: 'same-origin',
  });
  return res.ok;
}

/**
 * Subscribe to the per-session SSE stream. Registers TWO named-event listeners
 * (snapshot + update) plus the generic onerror handler. Returns a closer.
 *
 * Phase 2 adds the `onUpdate` handler — the server emits `event: update` on
 * every applyEvent via SessionBus. The browser store mirrors `msg.state` into
 * AppState, so the UI repaints without an EventSource reconnect.
 */
export function openEventStream(
  sessionKey: string,
  onSnapshot: (msg: SnapshotMessage) => void,
  onUpdate: (msg: UpdateMessage) => void,
  onError: () => void
): () => void {
  const es = new EventSource(`/api/events?session=${encodeURIComponent(sessionKey)}`, {
    withCredentials: true,
  });

  const snapshotHandler = (ev: MessageEvent) => {
    try {
      onSnapshot(JSON.parse(ev.data) as SnapshotMessage);
    } catch {
      onError();
    }
  };
  const updateHandler = (ev: MessageEvent) => {
    try {
      onUpdate(JSON.parse(ev.data) as UpdateMessage);
    } catch {
      onError();
    }
  };

  es.addEventListener('snapshot', snapshotHandler as EventListener);
  es.addEventListener('update', updateHandler as EventListener);
  es.onerror = onError;

  return () => es.close();
}

/**
 * POST the user's stale-diff-modal choice to the server. The server's
 * tokenValidate middleware requires the X-Review-Token header to match the
 * `review_session` cookie (double-submit pattern from Phase 1).
 *
 * Resolves { ok: true } on 200; throws on network error, missing token, or
 * any non-OK HTTP status.
 */
export async function chooseResume(params: {
  prKey: string;
  choice: ChooseResumeChoice;
  source: ChooseResumeSource;
}): Promise<{ ok: true }> {
  if (!reviewToken) {
    throw new Error('chooseResume: review token not set — call setReviewToken first');
  }
  const res = await fetch('/api/session/choose-resume', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Review-Token': reviewToken,
    },
    body: JSON.stringify(params),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new Error(`chooseResume failed: HTTP ${res.status}`);
  }
  return { ok: true };
}

/**
 * POST a user-triggered SessionEvent to the server. The server's tokenValidate
 * middleware requires the X-Review-Token header to match the `review_session`
 * cookie (double-submit pattern from Phase 1, same as chooseResume).
 *
 * Used by Plan 03-05 for the three user-driven event paths:
 *  - `r`-key toggle → `file.reviewStatusSet`
 *  - IntersectionObserver auto-transition → `file.reviewStatusSet`
 *  - Expand-generated-file click → `file.generatedExpandToggled`
 *
 * Resolves { ok: true } on 200; throws on missing token, network error, or
 * any non-OK HTTP status. Fails fast on missing token per T-3-05.
 */
export async function postSessionEvent(
  prKey: string,
  event: SessionEvent
): Promise<{ ok: true }> {
  if (!reviewToken) {
    throw new Error('postSessionEvent: review token not set — call setReviewToken first');
  }
  const res = await fetch('/api/session/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Review-Token': reviewToken,
    },
    body: JSON.stringify({ prKey, event }),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new Error(`postSessionEvent failed: HTTP ${res.status}`);
  }
  return { ok: true };
}
