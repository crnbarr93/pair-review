import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@git-diff-view/react/styles/diff-view-pure.css';
import { adoptSession, openEventStream } from './api';
import { actions } from './store';
import App from './App';

function renderFatal(msg: string): void {
  const root = document.getElementById('root');
  if (root) root.textContent = msg;
}

export async function bootstrap(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  const sessionKey = params.get('session') ?? '';

  if (!token) return renderFatal('Missing session token. Re-run /review.');

  const ok = await adoptSession(token);
  if (!ok) {
    actions.onAdoptFailed('unreachable');
    return renderFatal('Session rejected. Re-run /review.');
  }

  // T-03 TOKEN LEAK MITIGATION: wipe query BEFORE opening EventSource or painting anything
  history.replaceState('', '', '/');

  openEventStream(
    sessionKey,
    (msg) => actions.onSnapshot(msg),
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
