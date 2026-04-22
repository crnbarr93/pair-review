import type { Walkthrough, WalkthroughStep } from '@shared/types';

interface WalkthroughStepListProps {
  walkthrough: Walkthrough;
  onStepClick: (cursor: number) => void;
  onShowAllToggle: (showAll: boolean) => void;
}

function statusIcon(step: WalkthroughStep, isActive: boolean) {
  if (step.status === 'visited') return <span className="wsl-icon wsl-icon--done">&#10003;</span>;
  if (step.status === 'skipped') return <span className="wsl-icon wsl-icon--skipped">&#8212;</span>;
  if (isActive) return <span className="wsl-icon wsl-icon--active">&#9679;</span>;
  return <span className="wsl-icon wsl-icon--pending">&#9675;</span>;
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
          return (
            <div
              key={step.hunkId}
              role="listitem"
              className={`wsl-step${isActive ? ' wsl-step--active' : ''}`}
              onClick={() => onStepClick(i)}
            >
              {statusIcon(step, isActive)}
              <span className={`wsl-step-text${isActive ? ' wsl-step-text--active' : ''}`}>
                {step.commentary.length > 50 ? step.commentary.slice(0, 50) + '...' : step.commentary}
              </span>
              <span className="wsl-step-status">{statusLabel(step, isActive)}</span>
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
