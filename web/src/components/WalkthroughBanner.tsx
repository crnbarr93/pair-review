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
      <div className="walkthrough-banner-step" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)' }}>
        Step {stepNum} of {totalSteps}
        {step.status === 'skipped' && ' — Skipped'}
      </div>
      {isActive ? (
        <>
          {/* SECURITY: commentary is LLM-authored — render as React text node, NEVER innerHTML */}
          <div className="walkthrough-banner-body" style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)', marginTop: 4 }}>
            {step.commentary}
          </div>
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
        <div style={{ fontSize: 13, color: 'var(--ink-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {step.status === 'skipped' ? 'Skipped' : step.commentary}
        </div>
      )}
    </div>
  );
}
