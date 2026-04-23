import { useState, useEffect, useRef } from 'react';
import type { Verdict } from '@shared/types';
import { useAppStore, actions } from '../store';
import { confirmSubmit } from '../api';

const VERDICT_WORDS: Record<Verdict, string> = {
  approve: 'approve',
  request_changes: 'request changes',
  comment: 'comment',
};

/**
 * Phase 6 submit modal.
 *
 * Renders only when submitModalOpen is true (self-guarding so App.tsx mounts unconditionally).
 * Not dismissible via Escape or backdrop click when walkthrough is incomplete (D-03 gate).
 *
 * Flow:
 * 1. LLM calls submit_review → server fires submission.proposed → submitModalOpen becomes true
 * 2. User edits verdict/body, clicks "Post review" → confirmSubmit POST → submission.completed
 * 3. Modal closes automatically when submission.completed event arrives
 */
export function SubmitModal() {
  const state = useAppStore();

  const [verdict, setVerdict] = useState<Verdict>(
    state.pendingSubmission?.verdict ?? 'comment'
  );
  const [body, setBody] = useState(state.pendingSubmission?.body ?? '');
  const [retypeValue, setRetypeValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstCardRef = useRef<HTMLDivElement>(null);

  // Sync local state when pendingSubmission arrives (e.g. LLM drafts body)
  useEffect(() => {
    if (state.pendingSubmission) {
      setVerdict(state.pendingSubmission.verdict);
      setBody(state.pendingSubmission.body);
      setRetypeValue('');
      setError(null);
      setPending(false);
    }
  }, [state.pendingSubmission]);

  // Focus first verdict card when modal opens
  useEffect(() => {
    if (state.submitModalOpen) {
      firstCardRef.current?.focus();
    }
  }, [state.submitModalOpen]);

  // Escape to close only when walkthrough is complete
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && walkthroughComplete) {
        actions.setSubmitModalOpen(false);
      }
    }
    if (state.submitModalOpen) {
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }
  }, [state.submitModalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state.submitModalOpen) return null;

  // --- Signal-ratio calculation (D-02, SUB-02) ---
  const findings = state.selfReview?.findings ?? [];
  const counts = { blocker: 0, major: 0, minor: 0, nit: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as keyof typeof counts]++;
  }
  const total = findings.length;
  const signalRatio = total > 0 ? (counts.blocker + counts.major) / total : 1;
  const isNitHeavy = counts.nit > 3 || signalRatio < 0.4;

  // --- Walkthrough completion check (D-03) ---
  const steps = state.walkthrough?.steps ?? [];
  const visited = steps.filter((s) => s.status !== 'pending').length;
  const totalSteps = steps.length;
  const walkthroughComplete = totalSteps === 0 || visited >= totalSteps;

  // --- Retype gate (D-03) ---
  const retypeMatch =
    retypeValue.toLowerCase().trim() === VERDICT_WORDS[verdict];
  const canSubmit =
    !pending &&
    state.submissionState?.status !== 'submitted' &&
    (walkthroughComplete || retypeMatch);

  // --- Postable threads ---
  const postableThreads = Object.values(state.threads).filter(
    (t) => t.draftBody && !t.resolved
  );

  // --- Helpers ---
  const isLocalMode = state.prKey?.startsWith('local:');
  const isSubmitted = state.submissionState?.status === 'submitted';

  async function handleSubmit() {
    if (!canSubmit || pending) return;
    setPending(true);
    setError(null);
    try {
      await confirmSubmit({ prKey: state.prKey!, verdict, body });
      // SSE will deliver submission.completed which sets submitModalOpen: false
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
      setPending(false);
    }
  }

  function getSubmitLabel() {
    if (pending) return 'Posting review…';
    if (error) return 'Try again';
    if (isLocalMode) return 'Export to file';
    if (isNitHeavy && walkthroughComplete) return 'Post anyway';
    return 'Post review';
  }

  return (
    <div
      className="submit-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-modal-title"
    >
      <div className="submit-modal-card">
        {/* Header */}
        <div className="submit-modal-header">
          <h2 id="submit-modal-title">Post review</h2>
          {walkthroughComplete && (
            <button
              type="button"
              aria-label="Close submit modal"
              style={{ padding: '4px 8px', borderRadius: '4px', color: 'var(--ink-4)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}
              onClick={() => actions.setSubmitModalOpen(false)}
            >
              ×
            </button>
          )}
        </div>

        {/* Stats strip */}
        <div
          className={`submit-modal-stats${isNitHeavy ? ' submit-modal-stats--warn' : ''}`}
          role={isNitHeavy ? 'alert' : undefined}
        >
          <span className="stat-pill">{counts.blocker} blocker</span>
          <span className="stat-pill">{counts.major} major</span>
          <span className="stat-pill">{counts.minor} minor</span>
          <span className={`stat-pill${isNitHeavy ? ' nit-heavy' : ''}`}>{counts.nit} nit</span>
          {totalSteps > 0 && (
            <span className="stat-pill">Walkthrough: {visited}/{totalSteps} steps</span>
          )}
          {isNitHeavy && (
            <span className="warn-label">Nit-heavy review — consider consolidating minor feedback</span>
          )}
        </div>

        {/* Submitted success state */}
        {isSubmitted ? (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ok)', marginBottom: '8px' }}>
              Review posted
            </div>
            {state.submissionState?.url && (
              <a
                href={state.submissionState.url}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '13px', color: 'var(--claude)' }}
              >
                View on GitHub ↗
              </a>
            )}
            <div style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="btn-sm"
                onClick={() => actions.setSubmitModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Verdict cards */}
            <div className="submit-modal-verdicts">
              <div className="section-label">Verdict</div>
              <div role="radiogroup" aria-label="Verdict">
                <div
                  ref={firstCardRef}
                  tabIndex={0}
                  role="radio"
                  aria-checked={verdict === 'approve'}
                  className={`verdict-card verdict-card--approve${verdict === 'approve' ? ' verdict-card--selected' : ''}`}
                  onClick={() => setVerdict('approve')}
                  onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? setVerdict('approve') : undefined}
                >
                  <div className="verdict-radio" />
                  <span className="verdict-label">Approve</span>
                </div>
                <div
                  tabIndex={0}
                  role="radio"
                  aria-checked={verdict === 'request_changes'}
                  className={`verdict-card verdict-card--request${verdict === 'request_changes' ? ' verdict-card--selected' : ''}`}
                  onClick={() => setVerdict('request_changes')}
                  onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? setVerdict('request_changes') : undefined}
                >
                  <div className="verdict-radio" />
                  <span className="verdict-label">Request changes</span>
                  {counts.blocker > 0 && (
                    <span className="verdict-badge">{counts.blocker} blocker{counts.blocker !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <div
                  tabIndex={0}
                  role="radio"
                  aria-checked={verdict === 'comment'}
                  className={`verdict-card verdict-card--comment${verdict === 'comment' ? ' verdict-card--selected' : ''}`}
                  onClick={() => setVerdict('comment')}
                  onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? setVerdict('comment') : undefined}
                >
                  <div className="verdict-radio" />
                  <span className="verdict-label">Comment only</span>
                </div>
              </div>
            </div>

            {/* Review body textarea */}
            <div className="submit-modal-body">
              <div className="section-label">Review summary</div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-label="Review summary"
              />
            </div>

            {/* Threads list */}
            <div className="submit-modal-threads">
              <div className="section-label">Inline comments ({postableThreads.length})</div>
              {postableThreads.length === 0 ? (
                <div className="empty-state">
                  No inline comments drafted — the review will post summary only.
                </div>
              ) : (
                postableThreads.map((t) => {
                  // Find severity from self-review findings if available
                  const finding = findings.find((f) => f.lineId === t.lineId);
                  const sev = finding?.severity;
                  const firstLine = (t.draftBody ?? '').split('\n')[0];
                  return (
                    <div key={t.threadId} className="thread-row-summary">
                      {sev && (
                        <span className={`severity-pill severity-pill--${sev}`}>{sev}</span>
                      )}
                      <span className="thread-path">{t.path}:{t.line}</span>
                      <span className="thread-body-preview">{firstLine}</span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Incomplete walkthrough warning + retype gate (D-03) */}
            {!walkthroughComplete && (
              <div className="submit-modal-warn">
                <span>
                  Walkthrough incomplete ({visited}/{totalSteps} steps visited). Type your verdict to confirm early submit:
                </span>
                <input
                  type="text"
                  value={retypeValue}
                  onChange={(e) => setRetypeValue(e.target.value)}
                  placeholder={`Type "${VERDICT_WORDS[verdict]}" to confirm`}
                  aria-label="Retype verdict to confirm early submit"
                  aria-live="polite"
                />
              </div>
            )}

            {/* Error display */}
            {error && (
              <div style={{ padding: '8px 16px', color: 'var(--block)', fontSize: '12px', borderTop: '1px solid var(--line)' }}>
                Post failed — {error}. Check your network and try again.
              </div>
            )}

            {/* Footer */}
            <div className="submit-modal-footer">
              {walkthroughComplete && (
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => actions.setSubmitModalOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="btn-sm primary"
                onClick={handleSubmit}
                aria-disabled={!canSubmit}
                style={!canSubmit ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                {getSubmitLabel()}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
