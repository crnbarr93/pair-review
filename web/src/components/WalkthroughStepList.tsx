import type { Walkthrough } from '@shared/types';

function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

interface WalkthroughStepListProps {
  walkthrough: Walkthrough;
  onStepClick: (cursor: number) => void;
  onShowAllToggle: (showAll: boolean) => void;
}

export function WalkthroughStepList({ walkthrough, onStepClick, onShowAllToggle }: WalkthroughStepListProps) {
  const { steps, cursor, showAll } = walkthrough;
  const visitedCount = steps.filter(s => s.status === 'visited').length;
  const allVisited = visitedCount === steps.length;

  return (
    <div className="walkthrough-step-list" style={{ padding: '8px 0' }}>
      {/* Show-all toggle */}
      <div className="exp-toggle" style={{ marginBottom: 8, display: 'inline-flex' }}>
        <button
          type="button"
          className={cn(!showAll && 'on')}
          onClick={() => onShowAllToggle(false)}
          style={{ fontSize: 11 }}
        >
          Curated
        </button>
        <button
          type="button"
          className={cn(showAll && 'on')}
          onClick={() => onShowAllToggle(true)}
          style={{ fontSize: 11 }}
        >
          All hunks
        </button>
      </div>

      {/* Step list */}
      <div role="list" aria-label="Walkthrough steps">
        {steps.map((step, i) => {
          const isActive = i === cursor;
          const isDone = step.status === 'visited';
          const isSkipped = step.status === 'skipped';
          return (
            <div
              key={step.hunkId}
              role="listitem"
              className={cn(
                'walkthrough-step-entry',
                isActive && 'walkthrough-step-entry--active',
                isDone && 'walkthrough-step-entry--done',
                isSkipped && 'walkthrough-step-entry--skipped',
              )}
              onClick={() => onStepClick(i)}
              style={{ cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', minWidth: 20 }}>
                {step.stepNum}
              </span>
              <span style={{
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isSkipped ? 'var(--ink-4)' : 'var(--ink-2)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {step.commentary.slice(0, 60)}{step.commentary.length > 60 ? '...' : ''}
              </span>
              {isDone && <span style={{ color: 'var(--ok)', fontSize: 11 }}>Done</span>}
              {isSkipped && <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>Skipped</span>}
            </div>
          );
        })}
      </div>

      {/* Completion state */}
      {allVisited && (
        <div style={{ padding: '8px', fontSize: 12, color: 'var(--ok)' }}>
          Walkthrough complete — {visitedCount} of {steps.length} steps visited
        </div>
      )}
    </div>
  );
}
