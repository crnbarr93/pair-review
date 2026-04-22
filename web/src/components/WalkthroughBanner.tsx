import type { WalkthroughStep } from '@shared/types';

function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

interface WalkthroughBannerProps {
  step: WalkthroughStep;
  stepNum: number;
  totalSteps: number;
  isActive: boolean;
  onSkip: () => void;
  onNext: () => void;
}

export function WalkthroughBanner({ step, stepNum, totalSteps, isActive, onSkip, onNext }: WalkthroughBannerProps) {
  if (!isActive && step.status === 'pending') return null;

  const isCollapsed = !isActive;

  return (
    <div
      className={cn('walkthrough-banner', isCollapsed && 'walkthrough-banner--collapsed')}
      role="region"
      aria-label={`Walkthrough step ${stepNum} of ${totalSteps}`}
      aria-live={isActive ? 'polite' : undefined}
    >
      {isActive ? (
        <>
          <div className="walkthrough-banner-step" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)' }}>
            Step {stepNum} of {totalSteps}
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)', margin: '4px 0 0', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
            {step.commentary}
          </p>
          <div className="walkthrough-banner-controls" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn-sm" onClick={onSkip} style={{ fontSize: 12 }}>
              Skip step
            </button>
            <button type="button" className="btn-sm" onClick={onNext} style={{ fontSize: 12 }}>
              Next step
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', flexShrink: 0 }}>
            Step {stepNum}{step.status === 'skipped' ? ' skipped' : ''}
          </span>
          <span style={{ fontSize: 12, color: 'var(--ink-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {step.commentary}
          </span>
        </div>
      )}
    </div>
  );
}
