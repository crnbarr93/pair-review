import type { Walkthrough, WalkthroughStep } from '@shared/types';

interface WalkthroughStepListProps {
  walkthrough: Walkthrough;
  onStepClick: (cursor: number) => void;
  onShowAllToggle: (showAll: boolean) => void;
}

function StepIcon({ step, isActive }: { step: WalkthroughStep; isActive: boolean }) {
  if (step.status === 'visited') {
    return (
      <span className="wsl-icon wsl-icon--done">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2 2 4-4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (isActive) {
    return (
      <span className="wsl-icon wsl-icon--active">
        <span className="wsl-icon-dot" />
      </span>
    );
  }
  return <span className="wsl-icon wsl-icon--pending" />;
}

function statusLabel(step: WalkthroughStep, isActive: boolean) {
  if (step.status === 'visited') return 'Done';
  if (step.status === 'skipped') return 'Skipped';
  if (isActive) return 'Reviewing';
  return 'Not started';
}

export function WalkthroughStepList({ walkthrough, onStepClick, onShowAllToggle }: WalkthroughStepListProps) {
  const { steps, cursor, showAll } = walkthrough;
  const doneCount = steps.filter(s => s.status === 'visited').length;

  return (
    <div className="wsl">
      <div className="wsl-header">
        <span className="wsl-title">Review plan</span>
        <span className="wsl-counter">{doneCount}/{steps.length}</span>
      </div>

      <div className="wsl-steps" role="list" aria-label="Walkthrough steps">
        {steps.map((step, i) => {
          const isActive = i === cursor;
          const isPending = step.status === 'pending' && !isActive;
          return (
            <div
              key={step.hunkId}
              role="listitem"
              className="wsl-step"
              onClick={() => onStepClick(i)}
            >
              <StepIcon step={step} isActive={isActive} />
              <span className={`wsl-step-text${isActive ? ' wsl-step-text--active' : ''}${isPending ? ' wsl-step-text--pending' : ''}`}>
                {step.commentary.length > 45 ? step.commentary.slice(0, 45) + '...' : step.commentary}
              </span>
              <div style={{ flex: 1 }} />
              <span className="wsl-step-status">{statusLabel(step, isActive)}</span>
            </div>
          );
        })}
      </div>

      <div className="wsl-footer">
        <div className="wsl-hint">Want a different order? Ask Claude to reorder.</div>
      </div>
    </div>
  );
}
