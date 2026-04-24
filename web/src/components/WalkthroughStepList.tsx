import type { Walkthrough, WalkthroughStep } from '@shared/types';

interface WalkthroughStepListProps {
  walkthrough: Walkthrough;
  onStepClick: (cursor: number) => void;
  onStepComplete: (index: number) => void;
  onStepToggle: (index: number, status: 'visited' | 'pending') => void;
  onShowAllToggle?: (showAll: boolean) => void;  // optional — may not be rendered in right panel
}

function StepIcon({ step, isActive, onToggle }: { step: WalkthroughStep; isActive: boolean; onToggle: () => void }) {
  const handleClick = (e: React.MouseEvent) => { e.stopPropagation(); onToggle(); };
  const handleKey = (e: React.KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.stopPropagation(); onToggle(); } };

  if (step.status === 'visited') {
    return (
      <span
        className="wsl-icon wsl-icon--done"
        role="checkbox"
        aria-checked="true"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKey}
        title="Uncheck"
        style={{ cursor: 'pointer' }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2 2 4-4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={`wsl-icon ${isActive ? 'wsl-icon--active' : 'wsl-icon--pending'}`}
      role="checkbox"
      aria-checked="false"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKey}
      title="Mark as done"
      style={{ cursor: 'pointer' }}
    >
      {isActive && <span className="wsl-icon-dot" />}
    </span>
  );
}

function statusLabel(step: WalkthroughStep, isActive: boolean) {
  if (step.status === 'visited') return 'Done';
  if (step.status === 'skipped') return 'Skipped';
  if (isActive) return 'Reviewing';
  return 'Not started';
}

export function WalkthroughStepList({ walkthrough, onStepClick, onStepComplete, onStepToggle, onShowAllToggle }: WalkthroughStepListProps) {
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
          const toggleFn = () => {
            if (step.status === 'visited') {
              onStepToggle(i, 'pending');
            } else {
              onStepToggle(i, 'visited');
            }
          };
          return (
            <div
              key={step.hunkId}
              role="listitem"
              className="wsl-step"
              onClick={() => onStepClick(i)}
            >
              <StepIcon step={step} isActive={isActive} onToggle={toggleFn} />
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
        <div className="wsl-hint">Press <kbd>n</kbd> to complete current step and advance.</div>
      </div>
    </div>
  );
}
