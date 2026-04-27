export type ReviewStep = 'summary' | 'walkthrough' | 'review' | 'submission';

interface StepFooterProps {
  step: ReviewStep;
  loading?: boolean;
  onRegenerateSummary?: () => void;
  onMarkAllReviewed?: () => void;
  onExportComments?: () => void;
  onContinue?: () => void;
  summaryAge?: string;          // e.g. "2m ago"
  walkthroughStepsVisited?: number;
  walkthroughStepsTotal?: number;
}

export function StepFooter({
  step,
  loading,
  onRegenerateSummary,
  onMarkAllReviewed,
  onExportComments,
  onContinue,
  summaryAge,
}: StepFooterProps) {
  if (step === 'submission') return null;

  const loadingMeta: Record<string, string> = {
    summary: 'Generating summary · usually 3–8 seconds',
    walkthrough: 'Sequencing files · est. 4s remaining',
    review: '2 findings drafted · scanning for more',
  };

  return (
    <div className={`step-footer${loading ? ' step-footer--loading' : ''}`}>
      <div className="footer-secondary">
        {loading ? (
          <span className="skel-loading-meta">{loadingMeta[step]}</span>
        ) : (
          <>
            {step === 'summary' && (
              <>
                <button type="button" onClick={onRegenerateSummary}>
                  Regenerate summary
                </button>
                {summaryAge && (
                  <span>Last generated {summaryAge}</span>
                )}
              </>
            )}
            {step === 'walkthrough' && (
              <button type="button" onClick={onMarkAllReviewed}>
                Mark all reviewed
              </button>
            )}
            {step === 'review' && (
              <button type="button" onClick={onExportComments}>
                Export as comments
              </button>
            )}
          </>
        )}
      </div>

      <div className="footer-spacer" />

      <button type="button" className="footer-cta" onClick={onContinue}>
        {step === 'summary' && <>Continue to walkthrough <span aria-hidden="true">→</span></>}
        {step === 'walkthrough' && <>Continue to review <span aria-hidden="true">→</span></>}
        {step === 'review' && <>Continue to submission <span aria-hidden="true">→</span></>}
      </button>
    </div>
  );
}
