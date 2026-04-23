import { useState, useEffect, useRef } from 'react';
import type { Verdict } from '@shared/types';
import { useAppStore, actions } from '../store';
import { confirmSubmit } from '../api';

const VERDICT_WORDS: Record<Verdict, string> = {
  approve: 'approve',
  request_changes: 'request changes',
  comment: 'comment',
};

const VERDICT_SUBMIT_LABELS: Record<Verdict, string> = {
  approve: 'Approve & submit',
  request_changes: 'Request changes & submit',
  comment: 'Comment & submit',
};

/**
 * Phase 6 submit modal.
 *
 * Renders only when submitModalOpen is true (self-guarding so App.tsx mounts unconditionally).
 * Not dismissible via Escape or backdrop click when walkthrough is incomplete (D-03 gate).
 *
 * Flow:
 * 1. LLM calls submit_review -> server fires submission.proposed -> submitModalOpen becomes true
 * 2. User edits verdict/body, clicks "Post review" -> confirmSubmit POST -> submission.completed
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

  useEffect(() => {
    if (state.submitModalOpen) {
      // no-op: don't autofocus any element
    }
  }, [state.submitModalOpen]);

  // Escape always closes the modal (D-03 gate only blocks submitting, not dismissing)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
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

  // --- Thread counts by resolution ---
  const allThreads = Object.values(state.threads);
  const openThreadCount = allThreads.filter((t) => !t.resolved).length;
  const resolvedThreadCount = allThreads.filter((t) => t.resolved).length;

  // --- Helpers ---
  const isLocalMode = state.prKey?.startsWith('local:');
  const isSubmitted = state.submissionState?.status === 'submitted';
  const prNumber = state.pr?.number;

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
    if (pending) return 'Posting review...';
    if (error) return 'Try again';
    if (isLocalMode) return 'Export to file';
    if (isNitHeavy && walkthroughComplete) return 'Post anyway';
    return VERDICT_SUBMIT_LABELS[verdict];
  }

  function getSubmitColorClass() {
    if (verdict === 'approve') return 'sm-btn--approve';
    if (verdict === 'request_changes') return 'sm-btn--request';
    return 'sm-btn--comment';
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
        <div className="sm-header">
          <div className="sm-header-text">
            <span className="sm-header-label">REVIEW COMPLETE</span>
            <h2 id="submit-modal-title" className="sm-header-title">
              Submit review{prNumber ? ` for #${prNumber}` : ''}
            </h2>
          </div>
          <button
            type="button"
            className="sm-close-btn"
            aria-label="Close submit modal"
            onClick={() => actions.setSubmitModalOpen(false)}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Stats row */}
        <div
          className={`sm-stats-row${isNitHeavy ? ' sm-stats-row--warn' : ''}`}
          role={isNitHeavy ? 'alert' : undefined}
        >
          {totalSteps > 0 && (
            <div className="sm-stat-box">
              <span className="sm-stat-value">{visited}/{totalSteps}</span>
              <span className="sm-stat-label">STAGES</span>
            </div>
          )}
          <div className="sm-stat-box">
            <span className="sm-stat-value sm-stat-value--blocker">{counts.blocker}</span>
            <span className="sm-stat-label">BLOCKERS</span>
          </div>
          <div className="sm-stat-box">
            <span className="sm-stat-value sm-stat-value--warn">{counts.major}</span>
            <span className="sm-stat-label">WARNINGS</span>
          </div>
          <div className="sm-stat-box">
            <span className="sm-stat-value">{openThreadCount}</span>
            <span className="sm-stat-label">OPEN</span>
          </div>
          <div className="sm-stat-box">
            <span className="sm-stat-value sm-stat-value--ok">{resolvedThreadCount}</span>
            <span className="sm-stat-label">RESOLVED</span>
          </div>
          {isNitHeavy && (
            <div className="sm-nit-warn">
              Nit-heavy review -- consider consolidating minor feedback
            </div>
          )}
        </div>

        {/* Submitted success state */}
        {isSubmitted ? (
          <div className="sm-submitted">
            <div className="sm-submitted-icon">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="16" fill="var(--ok-bg)" />
                <path d="M10 16L14.5 20.5L22 11" stroke="var(--ok)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="sm-submitted-title">Review posted</div>
            {state.submissionState?.url && (
              <a
                href={state.submissionState.url}
                target="_blank"
                rel="noreferrer"
                className="sm-submitted-link"
              >
                View on GitHub
              </a>
            )}
            <button
              type="button"
              className="btn-sm"
              style={{ marginTop: '16px' }}
              onClick={() => actions.setSubmitModalOpen(false)}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Verdict cards */}
            <div className="sm-section">
              <div className="sm-section-label">YOUR VERDICT</div>
              <div className="sm-verdict-row" role="radiogroup" aria-label="Verdict">
                <div
                  ref={firstCardRef}
                  tabIndex={0}
                  role="radio"
                  aria-checked={verdict === 'approve'}
                  className={`sm-verdict-card sm-verdict-card--approve${verdict === 'approve' ? ' sm-verdict-card--selected' : ''}`}
                  onClick={() => setVerdict('approve')}
                  onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? setVerdict('approve') : undefined}
                >
                  <div className="sm-verdict-icon sm-verdict-icon--approve">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8L6.5 11.5L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="sm-verdict-text">
                    <div className="sm-verdict-title">Approve</div>
                    <div className="sm-verdict-sub">Looks good to merge</div>
                  </div>
                </div>
                <div
                  tabIndex={0}
                  role="radio"
                  aria-checked={verdict === 'request_changes'}
                  className={`sm-verdict-card sm-verdict-card--request${verdict === 'request_changes' ? ' sm-verdict-card--selected' : ''}`}
                  onClick={() => setVerdict('request_changes')}
                  onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? setVerdict('request_changes') : undefined}
                >
                  <div className="sm-verdict-icon sm-verdict-icon--request">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="8" cy="12" r="1.2" fill="currentColor" />
                    </svg>
                  </div>
                  <div className="sm-verdict-text">
                    <div className="sm-verdict-title">
                      Request changes
                      {counts.blocker > 0 && (
                        <span className="sm-verdict-badge sm-verdict-badge--blocker">
                          {counts.blocker} blocker{counts.blocker !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="sm-verdict-sub">Needs work before merge</div>
                  </div>
                </div>
                <div
                  tabIndex={0}
                  role="radio"
                  aria-checked={verdict === 'comment'}
                  className={`sm-verdict-card sm-verdict-card--comment${verdict === 'comment' ? ' sm-verdict-card--selected' : ''}`}
                  onClick={() => setVerdict('comment')}
                  onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? setVerdict('comment') : undefined}
                >
                  <div className="sm-verdict-icon sm-verdict-icon--comment">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <div className="sm-verdict-text">
                    <div className="sm-verdict-title">Comment only</div>
                    <div className="sm-verdict-sub">Thoughts without approval</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Review body textarea */}
            <div className="sm-section">
              <div className="sm-section-label">REVIEW SUMMARY</div>
              <textarea
                className="sm-textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-label="Review summary"
                placeholder="Write your review summary..."
              />
              <div className="sm-textarea-meta">
                <span>Markdown supported &middot; {body.length} chars</span>
              </div>
            </div>

            {/* Threads list */}
            <div className="sm-section sm-threads-section">
              <div className="sm-section-label">
                THREADS TO POST ({postableThreads.length})
              </div>
              {postableThreads.length === 0 ? (
                <div className="sm-empty-threads">
                  No inline comments drafted -- the review will post summary only.
                </div>
              ) : (
                <div className="sm-thread-list">
                  {postableThreads.map((t) => {
                    const finding = findings.find((f) => f.lineId === t.lineId);
                    const sev = finding?.severity;
                    const firstLine = (t.draftBody ?? '').split('\n')[0];
                    return (
                      <div key={t.threadId} className="sm-thread-row">
                        <div className={`sm-thread-dot${sev ? ` sm-thread-dot--${sev}` : ''}`} />
                        <div className="sm-thread-info">
                          <div className="sm-thread-preview">{firstLine}</div>
                          <div className="sm-thread-path">{t.path}:{t.line}</div>
                        </div>
                        {sev && (
                          <span className={`sm-thread-sev sm-thread-sev--${sev}`}>
                            {sev.toUpperCase()}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Incomplete walkthrough warning + retype gate (D-03) */}
            {!walkthroughComplete && (
              <div className="sm-warn-strip">
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
              <div className="sm-error">
                Post failed -- {error}. Check your network and try again.
              </div>
            )}

            {/* Footer */}
            <div className="sm-footer">
              <div className="sm-footer-credit">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <rect width="14" height="14" rx="4" fill="var(--ink-4)" fillOpacity="0.15" />
                  <text x="7" y="10.5" textAnchor="middle" fontSize="8" fontWeight="600" fontFamily="var(--mono)" fill="var(--ink-4)">C</text>
                </svg>
                <span>Co-reviewed with Claude</span>
              </div>
              <div className="sm-footer-actions">
                <button
                  type="button"
                  className="sm-btn-cancel"
                  onClick={() => actions.setSubmitModalOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`sm-btn-submit ${getSubmitColorClass()}`}
                  onClick={handleSubmit}
                  aria-disabled={!canSubmit}
                  style={!canSubmit ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                >
                  {getSubmitLabel()}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
