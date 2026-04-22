import type { Walkthrough, WalkthroughStep } from '@shared/types';

interface WalkthroughStepListProps {
  walkthrough: Walkthrough;
  onStepClick: (cursor: number) => void;
  onShowAllToggle: (showAll: boolean) => void;
}

function StepIcon({ step, isActive }: { step: WalkthroughStep; isActive: boolean }) {
  if (step.status === 'visited') {
    return (
      <svg className="wsl-icon" viewBox="0 0 20 20" fill="none">
        <rect width="20" height="20" rx="5" fill="var(--claude)" />
        <path d="M6 10.5l2.5 2.5L14 7.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (isActive) {
    return (
      <svg className="wsl-icon" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" stroke="var(--ink)" strokeWidth="2" />
        <circle cx="10" cy="10" r="5" fill="var(--ink)" />
      </svg>
    );
  }
  return (
    <svg className="wsl-icon" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" stroke="var(--ink-4)" strokeWidth="1.5" />
    </svg>
  );
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
        <span className="wsl-title">Walkthrough</span>
        <span className="wsl-counter">{doneCount}/{steps.length}</span>
      </div>

      <div className="wsl-steps" role="list" aria-label="Walkthrough steps">
        {steps.map((step, i) => {
          const isActive = i === cursor;
          const isDone = step.status === 'visited';
          const isPending = step.status === 'pending' && !isActive;
          return (
            <div
              key={step.hunkId}
              role="listitem"
              className={`wsl-step${isActive ? ' wsl-step--active' : ''}`}
              onClick={() => onStepClick(i)}
            >
              <StepIcon step={step} isActive={isActive} />
              <span className={`wsl-step-text${isActive ? ' wsl-step-text--active' : ''}${isPending ? ' wsl-step-text--pending' : ''}`}>
                {step.commentary.length > 40 ? step.commentary.slice(0, 40) + '...' : step.commentary}
              </span>
              <span className={`wsl-step-status${isDone ? ' wsl-step-status--done' : ''}`}>
                {statusLabel(step, isActive)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="wsl-footer">
        <div className="wsl-toggle">
          <button type="button" className={!showAll ? 'wsl-toggle-btn wsl-toggle-btn--on' : 'wsl-toggle-btn'} onClick={() => onShowAllToggle(false)}>Curated</button>
          <button type="button" className={showAll ? 'wsl-toggle-btn wsl-toggle-btn--on' : 'wsl-toggle-btn'} onClick={() => onShowAllToggle(true)}>All hunks</button>
        </div>
        <div className="wsl-hint">Want a different order? Ask Claude to reorder.</div>
      </div>
    </div>
  );
}
