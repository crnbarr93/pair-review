import { useState, useEffect, useRef } from 'react';
import type { Verdict } from '@shared/types';
import { useAppStore, actions } from '../store';
import { confirmSubmit, postUserRequest } from '../api';

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

// ============================================================
// Shared inner logic hook — used by both SubmissionPanel and SubmitModal
// ============================================================
function useSubmissionState() {
  const state = useAppStore();

  const [verdict, setVerdict] = useState<Verdict>(
    state.pendingSubmission?.verdict ?? 'comment'
  );
  const [body, setBody] = useState(state.pendingSubmission?.body ?? '');
  const [retypeValue, setRetypeValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const submissionUrl = state.submissionState?.url;

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

  return {
    verdict, setVerdict,
    body, setBody,
    retypeValue, setRetypeValue,
    pending, error,
    counts, total, isNitHeavy,
    visited, totalSteps, walkthroughComplete,
    canSubmit,
    postableThreads, findings,
    openThreadCount, resolvedThreadCount,
    isLocalMode, isSubmitted, prNumber, submissionUrl,
    handleSubmit, getSubmitLabel, getSubmitColorClass,
    prKey: state.prKey,
  };
}

// ============================================================
// Generate review summary button — asks Claude to draft the review body
// ============================================================
function GenerateReviewButton({ onGenerated, prKey }: { onGenerated: (body: string) => void; prKey: string }) {
  const [generating, setGenerating] = useState(false);
  const chatMessages = useAppStore().chatMessages;

  const latestLlmRef = useRef(chatMessages.filter(m => m.author === 'llm').length);

  async function handleGenerate() {
    if (!prKey || generating) return;
    setGenerating(true);
    latestLlmRef.current = chatMessages.filter(m => m.author === 'llm').length;
    try {
      await postUserRequest(prKey, {
        type: 'chat',
        payload: { message: 'Please draft a review summary for this PR that I can paste into the review body. Include key observations, any concerns, and an overall assessment. Format it as markdown. IMPORTANT: Start your response with the review text directly — no preamble like "Here\'s a draft". Just the review content.' },
      });
    } catch {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (!generating) return;
    const llmMessages = chatMessages.filter(m => m.author === 'llm');
    if (llmMessages.length > latestLlmRef.current) {
      const latest = llmMessages[llmMessages.length - 1];
      if (latest) {
        onGenerated(latest.message);
      }
      setGenerating(false);
    }
  }, [chatMessages, generating, onGenerated]);

  return (
    <button
      type="button"
      className="sm-generate-btn"
      onClick={handleGenerate}
      disabled={generating}
    >
      {generating ? (
        <>
          <span className="sm-generate-spinner" />
          Generating...
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>
          Generate with Claude
        </>
      )}
    </button>
  );
}

// ============================================================
// Shared inner content — rendered by both SubmissionPanel and SubmitModal
// ============================================================
function SubmissionContent({ onClose }: { onClose?: () => void }) {
  const s = useSubmissionState();
  const firstCardRef = useRef<HTMLDivElement>(null);

  return (
    <>
      {/* Header */}
      <div className="sm-header">
        <div className="sm-header-text">
          <span className="sm-header-label">REVIEW COMPLETE</span>
          <h2 id="submit-modal-title" className="sm-header-title">
            Submit review{s.prNumber ? ` for #${s.prNumber}` : ''}
          </h2>
        </div>
        {onClose && (
          <button
            type="button"
            className="sm-close-btn"
            aria-label="Close submit modal"
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Stats row */}
      <div
        className={`sm-stats-row${s.isNitHeavy ? ' sm-stats-row--warn' : ''}`}
        role={s.isNitHeavy ? 'alert' : undefined}
      >
        {s.totalSteps > 0 && (
          <div className="sm-stat-box">
            <span className="sm-stat-value">{s.visited}/{s.totalSteps}</span>
            <span className="sm-stat-label">STAGES</span>
          </div>
        )}
        <div className="sm-stat-box">
          <span className="sm-stat-value sm-stat-value--blocker">{s.counts.blocker}</span>
          <span className="sm-stat-label">BLOCKERS</span>
        </div>
        <div className="sm-stat-box">
          <span className="sm-stat-value sm-stat-value--warn">{s.counts.major}</span>
          <span className="sm-stat-label">WARNINGS</span>
        </div>
        <div className="sm-stat-box">
          <span className="sm-stat-value">{s.openThreadCount}</span>
          <span className="sm-stat-label">OPEN</span>
        </div>
        <div className="sm-stat-box">
          <span className="sm-stat-value sm-stat-value--ok">{s.resolvedThreadCount}</span>
          <span className="sm-stat-label">RESOLVED</span>
        </div>
        {s.isNitHeavy && (
          <div className="sm-nit-warn">
            Nit-heavy review -- consider consolidating minor feedback
          </div>
        )}
      </div>

      {/* Submitted success state */}
      {s.isSubmitted ? (
        <div className="sm-submitted">
          <div className="sm-submitted-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="16" fill="var(--ok-bg)" />
              <path d="M10 16L14.5 20.5L22 11" stroke="var(--ok)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="sm-submitted-title">Review posted</div>
          {s.submissionUrl && (
            <a
              href={s.submissionUrl}
              target="_blank"
              rel="noreferrer"
              className="sm-submitted-link"
            >
              View on GitHub
            </a>
          )}
          {onClose && (
            <button
              type="button"
              className="btn-sm"
              style={{ marginTop: '16px' }}
              onClick={onClose}
            >
              Close
            </button>
          )}
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
                aria-checked={s.verdict === 'approve'}
                className={`sm-verdict-card sm-verdict-card--approve${s.verdict === 'approve' ? ' sm-verdict-card--selected' : ''}`}
                onClick={() => s.setVerdict('approve')}
                onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? s.setVerdict('approve') : undefined}
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
                aria-checked={s.verdict === 'request_changes'}
                className={`sm-verdict-card sm-verdict-card--request${s.verdict === 'request_changes' ? ' sm-verdict-card--selected' : ''}`}
                onClick={() => s.setVerdict('request_changes')}
                onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? s.setVerdict('request_changes') : undefined}
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
                    {s.counts.blocker > 0 && (
                      <span className="sm-verdict-badge sm-verdict-badge--blocker">
                        {s.counts.blocker} blocker{s.counts.blocker !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="sm-verdict-sub">Needs work before merge</div>
                </div>
              </div>
              <div
                tabIndex={0}
                role="radio"
                aria-checked={s.verdict === 'comment'}
                className={`sm-verdict-card sm-verdict-card--comment${s.verdict === 'comment' ? ' sm-verdict-card--selected' : ''}`}
                onClick={() => s.setVerdict('comment')}
                onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? s.setVerdict('comment') : undefined}
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
            <div className="sm-section-label-row">
              <span className="sm-section-label">REVIEW SUMMARY</span>
              <GenerateReviewButton onGenerated={s.setBody} prKey={s.prKey} />
            </div>
            <textarea
              className="sm-textarea"
              value={s.body}
              onChange={(e) => s.setBody(e.target.value)}
              aria-label="Review summary"
              placeholder="Write your review summary..."
            />
            <div className="sm-textarea-meta">
              <span>Markdown supported &middot; {s.body.length} chars</span>
            </div>
          </div>

          {/* Threads list */}
          <div className="sm-section sm-threads-section">
            <div className="sm-section-label">
              THREADS TO POST ({s.postableThreads.length})
            </div>
            {s.postableThreads.length === 0 ? (
              <div className="sm-empty-threads">
                No inline comments drafted -- the review will post summary only.
              </div>
            ) : (
              <div className="sm-thread-list">
                {s.postableThreads.map((t) => {
                  const finding = s.findings.find((f) => f.lineId === t.lineId);
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
          {!s.walkthroughComplete && (
            <div className="sm-warn-strip">
              <span>
                Walkthrough incomplete ({s.visited}/{s.totalSteps} steps visited). Type your verdict to confirm early submit:
              </span>
              <input
                type="text"
                value={s.retypeValue}
                onChange={(e) => s.setRetypeValue(e.target.value)}
                placeholder={`Type "${VERDICT_WORDS[s.verdict]}" to confirm`}
                aria-label="Retype verdict to confirm early submit"
                aria-live="polite"
              />
            </div>
          )}

          {/* Error display */}
          {s.error && (
            <div className="sm-error">
              Post failed -- {s.error}. Check your network and try again.
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
              {onClose && (
                <button
                  type="button"
                  className="sm-btn-cancel"
                  onClick={onClose}
                  disabled={s.pending}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                className={`sm-btn-submit ${s.getSubmitColorClass()}`}
                onClick={s.handleSubmit}
                aria-disabled={!s.canSubmit}
                style={!s.canSubmit ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                {s.getSubmitLabel()}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ============================================================
// SubmissionPanel — redesigned per Phase 06.2 design:
// Checklist recap + Claude verdict suggestion + CTA to open submit dialog.
// ============================================================
export function SubmissionPanel() {
  const state = useAppStore();
  const [modalOpen, setModalOpen] = useState(false);

  const walkthrough = state.walkthrough;
  const selfReview = state.selfReview;
  const stepsVisited = walkthrough?.steps.filter(s => s.status === 'visited').length ?? 0;
  const stepsTotal = walkthrough?.steps.length ?? 0;
  const blockerCount = selfReview?.findings.filter(f => f.severity === 'blocker').length ?? 0;
  const openCount = selfReview?.findings.length ?? 0;
  const verdict = selfReview?.verdict;

  return (
    <div className="submission-panel">
      {/* Header */}
      <div className="subp-header">
        <div className="subp-stage-label">Stage 4 · Submission</div>
        <div className="subp-title">Ready to submit?</div>
        <div className="subp-subtitle">Review the recap, then choose a verdict.</div>
      </div>

      {/* Checklist table */}
      <div className="subp-checklist">
        <div className="subp-row">
          <span className="subp-row-label">Stages completed</span>
          <span className="subp-row-value">3 of 3 · Summary, Walkthrough, Review</span>
        </div>
        <div className="subp-row">
          <span className="subp-row-label">Findings</span>
          <span className="subp-row-value">
            {blockerCount > 0 && <span className="subp-badge subp-badge--blocker">{blockerCount} blocker{blockerCount !== 1 ? 's' : ''}</span>}
            <span className="subp-badge subp-badge--open">{openCount} open</span>
          </span>
        </div>
        <div className="subp-row">
          <span className="subp-row-label">Walkthrough</span>
          <span className="subp-row-value">{stepsVisited} of {stepsTotal} steps visited</span>
        </div>
      </div>

      {/* Claude suggestion */}
      {verdict && (
        <div className="subp-suggestion">
          <div className="subp-suggestion-header">
            <span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>
              {' '}Claude suggests: <strong>{VERDICT_WORDS[verdict] ?? verdict}</strong>
            </span>
          </div>
          {blockerCount > 0 && (
            <p className="subp-suggestion-body">
              There{blockerCount === 1 ? "'s" : ' are'} {blockerCount} unresolved blocker{blockerCount !== 1 ? 's' : ''}.
              Everything else is warnings or nits that can ship as follow-ups.
            </p>
          )}
        </div>
      )}

      {/* CTA */}
      <button
        type="button"
        className="subp-cta"
        onClick={() => setModalOpen(true)}
      >
        <span className="subp-cta-title">Open submission dialog</span>
        <span className="subp-cta-sub">Choose approve / comment / request changes</span>
      </button>

      {/* Reuse existing SubmitModal when opened */}
      {modalOpen && (
        <div className="submit-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="submit-modal-card" onClick={e => e.stopPropagation()}>
            <SubmissionContent />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SubmitModal — legacy modal variant (preserved for backward compat until Plan 04)
//
// Phase 6 submit modal.
// Renders only when submitModalOpen is true (self-guarding so App.tsx mounts unconditionally).
// Not dismissible via Escape or backdrop click when walkthrough is incomplete (D-03 gate).
//
// Flow:
// 1. LLM calls submit_review -> server fires submission.proposed -> submitModalOpen becomes true
// 2. User edits verdict/body, clicks "Post review" -> confirmSubmit POST -> submission.completed
// 3. Modal closes automatically when submission.completed event arrives
// ============================================================
export function SubmitModal() {
  const state = useAppStore();

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

  return (
    <div
      className="submit-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-modal-title"
    >
      <div className="submit-modal-card">
        <SubmissionContent onClose={() => actions.setSubmitModalOpen(false)} />
      </div>
    </div>
  );
}
