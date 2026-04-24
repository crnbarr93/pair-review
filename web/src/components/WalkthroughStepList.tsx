import type { Walkthrough, WalkthroughStep } from '@shared/types';

interface WalkthroughStepListProps {
  walkthrough: Walkthrough;
  onStepClick: (cursor: number) => void;
  onStepComplete: (index: number) => void;
  onStepToggle: (index: number, status: 'visited' | 'pending') => void;
  onShowAllToggle?: (showAll: boolean) => void;
}

function fileFromHunkId(hunkId: string): string {
  const parts = hunkId.split(':');
  return parts[0] ?? hunkId;
}

function StepBadge({ step, index, isActive }: { step: WalkthroughStep; index: number; isActive: boolean }) {
  if (step.status === 'visited') {
    return (
      <span className="wsl-badge wsl-badge--done">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6l2.5 2.5 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (isActive) {
    return (
      <span className="wsl-badge wsl-badge--active">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6l2.5 2.5 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="wsl-badge wsl-badge--pending">{index + 1}</span>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

export function WalkthroughStepList({ walkthrough, onStepClick, onStepComplete, onStepToggle }: WalkthroughStepListProps) {
  const { steps, cursor } = walkthrough;
  const doneCount = steps.filter(s => s.status === 'visited').length;

  return (
    <div className="wsl">
      <div className="wsl-header">
        <div className="wsl-stage-label">Stage 2 · Walkthrough</div>
        <div className="wsl-title">Reading path</div>
        <div className="wsl-subtitle">{doneCount} of {steps.length} steps reviewed · click a step to load the file</div>
      </div>

      <div className="wsl-steps" role="list" aria-label="Walkthrough steps">
        {steps.map((step, i) => {
          const isActive = i === cursor;
          const filePath = fileFromHunkId(step.hunkId);
          const toggleFn = (e: React.MouseEvent) => {
            e.stopPropagation();
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
              className={`wsl-card${isActive ? ' wsl-card--active' : ''}`}
              onClick={() => onStepClick(i)}
            >
              <div className="wsl-card-header" onClick={toggleFn}>
                <StepBadge step={step} index={i} isActive={isActive} />
                <span className="wsl-card-title">{truncate(step.commentary.split('.')[0] || step.commentary, 60)}</span>
              </div>
              <div className="wsl-card-body">
                {step.commentary.includes('.') && (
                  <p className="wsl-card-desc">
                    {truncate(step.commentary.slice(step.commentary.indexOf('.') + 1).trim(), 150)}
                  </p>
                )}
                <div className="wsl-card-file">{filePath}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
