export type ReviewStep = 'summary' | 'walkthrough' | 'review' | 'submission';

interface StepFooterProps {
  step: ReviewStep;
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
  onRegenerateSummary,
  onMarkAllReviewed,
  onExportComments,
  onContinue,
  summaryAge,
}: StepFooterProps) {
  if (step === 'submission') return null;

  return (
    <div className="step-footer">
      <div className="footer-secondary">
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
