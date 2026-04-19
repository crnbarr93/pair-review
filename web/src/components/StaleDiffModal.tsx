import { useState } from 'react';
import { useAppStore } from '../store';
import { chooseResume } from '../api';
import type { ChooseResumeChoice } from '../api';

/**
 * Phase 2 stale-diff modal.
 *
 * Renders ONLY when state.staleDiff is present (self-guarding so App.tsx can
 * mount it unconditionally). Three buttons map to three reducer events on the
 * server via POST /api/session/choose-resume.
 *
 * Per SESS-02 + research Pattern 4: NOT dismissible except by button press.
 * - No Escape keydown handler
 * - No onClick on the backdrop
 * - No close button
 *
 * After a choice is posted, buttons hide and "Refreshing diff…" overlay
 * appears until the next SSE snapshot/update arrives and clears staleDiff,
 * at which point the modal unmounts naturally.
 */
export function StaleDiffModal() {
  const state = useAppStore();
  const [pending, setPending] = useState<ChooseResumeChoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!state.staleDiff) return null;

  // Guard: if we somehow have staleDiff without a source (e.g. bootstrap
  // failed to capture source from URL), show a minimal fail-safe dialog.
  if (!state.source) {
    return (
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
        role="dialog"
        aria-modal="true"
      >
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg max-w-md shadow-xl">
          <p className="text-sm">Resume state incomplete — please re-run /review.</p>
        </div>
      </div>
    );
  }

  const handle = async (choice: ChooseResumeChoice) => {
    if (pending) return;
    setPending(choice);
    setError(null);
    try {
      await chooseResume({
        prKey: state.sessionKey,
        choice,
        source: state.source!,
      });
      // Server pushes snapshot/update via SSE; store reducer clears
      // state.staleDiff; modal unmounts naturally. If SSE never arrives,
      // `pending` stays set and "Refreshing diff…" is shown indefinitely —
      // the user can close the browser and re-run /review.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resume failed');
      setPending(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stale-diff-title"
    >
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg max-w-md w-full shadow-xl">
        <h2 id="stale-diff-title" className="text-lg font-semibold mb-2">
          PR updated
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
          This PR's head SHA changed since your last session.
        </p>
        <p className="text-xs font-mono text-zinc-500 mb-4">
          Stored: {state.staleDiff.storedSha.slice(0, 8)} → Current:{' '}
          {state.staleDiff.currentSha.slice(0, 8)}
        </p>

        {pending ? (
          <div className="py-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
            Refreshing diff…
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
              onClick={() => handle('adopt')}
              disabled={pending !== null}
            >
              Refresh to current PR
            </button>
            <button
              type="button"
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50"
              onClick={() => handle('reset')}
              disabled={pending !== null}
            >
              Discard session
            </button>
            <button
              type="button"
              className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded disabled:opacity-50"
              onClick={() => handle('viewBoth')}
              disabled={pending !== null}
            >
              View both
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
