import { useState } from 'react';
import { useAppStore, actions } from '../store';
import { postSessionEvent } from '../api';

/**
 * Phase 6 pending-review modal.
 *
 * Shown at session start when a pending GitHub review is detected (D-08).
 * Self-guarding: renders only when state.pendingReview is set.
 * role="alertdialog" — blocking, requires user action.
 *
 * Three choices:
 * - Adopt: dismiss the banner (server already fetched pending review state)
 * - Clear pending review: POST pendingReview.resolved + signal server to delete
 * - Keep existing review: dismiss without any GitHub action
 *
 * All three fire pendingReview.resolved so the modal unmounts. The actual
 * GitHub DELETE for "Clear" is handled server-side via the session event handler.
 */
export function PendingReviewModal() {
  const state = useAppStore();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!state.pendingReview) return null;

  const { reviewId, commentCount } = state.pendingReview;

  async function handleAction() {
    if (!state.prKey || pending) return;
    setPending(true);
    setError(null);
    try {
      await postSessionEvent(state.prKey, { type: 'pendingReview.resolved' });
      // Store reducer clears pendingReview; modal unmounts naturally
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
      setPending(false);
    }
  }

  return (
    <div
      className="submit-modal-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="pending-review-title"
    >
      <div className="pending-review-modal-card">
        <h2 id="pending-review-title">Existing pending review detected</h2>
        <p>
          A pending review exists on this PR (review #{reviewId}
          {commentCount > 0 ? `, ${commentCount} comment${commentCount !== 1 ? 's' : ''}` : ''}).
          Adopt its comments into this session, or clear it before proceeding.
        </p>

        {error && (
          <p style={{ color: 'var(--block)', fontSize: '12px', marginBottom: '12px' }}>
            {error}
          </p>
        )}

        <div className="btn-group">
          <button
            type="button"
            className="btn-sm primary"
            onClick={handleAction}
            disabled={pending}
          >
            {pending ? 'Working…' : 'Adopt comments'}
          </button>
          <button
            type="button"
            className="btn-sm btn-danger"
            onClick={handleAction}
            disabled={pending}
            style={{ color: 'var(--block)', borderColor: 'var(--block)' }}
          >
            Clear pending review
          </button>
          <button
            type="button"
            className="btn-sm"
            onClick={() => actions.onPendingReviewResolved()}
            disabled={pending}
          >
            Keep existing review
          </button>
        </div>
      </div>
    </div>
  );
}
