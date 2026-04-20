import { Fragment, useState } from 'react';
import type { ChecklistCategory, CIStatus, PrSummary, PullRequestMeta, SelfReview } from '@shared/types';
import { Ic } from './icons';

function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

const CATEGORIES: ChecklistCategory[] = ['correctness', 'security', 'tests', 'performance', 'style'];
const CAT_LABELS: Record<ChecklistCategory, string> = {
  correctness: 'Correctness',
  security: 'Security',
  tests: 'Tests',
  performance: 'Performance',
  style: 'Style',
};

interface TopBarProps {
  pr: PullRequestMeta;
  ciStatus?: CIStatus;
  summary?: PrSummary | null;
  selfReview?: SelfReview | null;
  activeCategory: ChecklistCategory | null;
  findingsSidebarOpen: boolean;
  onSummaryStep: () => void;
  onSelfReviewStep: () => void;
  onCategoryClick: (cat: ChecklistCategory | null) => void;
  onToggleFindingsSidebar: () => void;
  onSettingsClick: () => void;
  onRequestChanges: () => void;
  onApprove: () => void;
}

export function TopBar({
  pr,
  ciStatus,
  summary,
  selfReview,
  activeCategory,
  findingsSidebarOpen,
  onSummaryStep,
  onSelfReviewStep,
  onCategoryClick,
  onToggleFindingsSidebar,
  onSettingsClick,
  onRequestChanges,
  onApprove,
}: TopBarProps) {
  const hasGhCoords =
    pr.source === 'github' &&
    !!pr.owner &&
    !!pr.repo &&
    typeof pr.number === 'number';
  return (
    <div className="topbar">
      <div className="brand">
        <div className="logo">P</div>
        <span>PairReview</span>
      </div>
      <div className="sep" />
      <div className="pr">
        {hasGhCoords && (
          <span className="num">
            {pr.owner}/{pr.repo} #{pr.number}
          </span>
        )}
        <span className="title">{pr.title}</span>
      </div>
      <div className="branch">
        <Ic.branch /> {pr.headBranch}{' '}
        <span style={{ color: 'var(--ink-4)' }}>→</span> {pr.baseBranch}
      </div>
      <CIPill ciStatus={ciStatus} />
      <button
        type="button"
        className={cn('topbtn', findingsSidebarOpen && 'topbtn--active')}
        onClick={onToggleFindingsSidebar}
      >
        Findings
      </button>
      <div className="spacer" />
      <button type="button" className="topbtn" onClick={onSettingsClick}>
        <Ic.settings /> Settings
      </button>
      <button type="button" className="topbtn" onClick={onRequestChanges}>
        Request changes
      </button>
      <button type="button" className="primary" onClick={onApprove}>
        Approve &amp; merge
      </button>
    </div>
  );
}

/**
 * CI status pill — D-25 palette, D-26 hide-when-none.
 * `bucket`/`link` come from `gh pr checks --json` (D-24 correction).
 */
function CIPill({ ciStatus }: { ciStatus: CIStatus | undefined }) {
  const [expanded, setExpanded] = useState(false);
  // D-26: hide entirely when no CI (local-branch mode or PR with no checks)
  if (!ciStatus || ciStatus.aggregate === 'none') return null;

  const palette: Record<CIStatus['aggregate'], { bg: string; fg: string }> = {
    pass: { bg: 'var(--ok-bg)', fg: 'var(--ok)' },
    fail: { bg: 'var(--block-bg)', fg: 'var(--block)' },
    pending: { bg: 'var(--warn-bg)', fg: 'var(--warn)' },
    none: { bg: 'var(--paper-2)', fg: 'var(--ink-4)' },
  };
  const { bg, fg } = palette[ciStatus.aggregate];
  const failCount = ciStatus.checks.filter((c) => c.bucket === 'fail').length;
  const pendingCount = ciStatus.checks.filter(
    (c) => c.bucket === 'pending'
  ).length;
  const label =
    ciStatus.aggregate === 'pass'
      ? 'All checks passed'
      : ciStatus.aggregate === 'fail'
        ? `${failCount} check${failCount !== 1 ? 's' : ''} failing`
        : `${pendingCount} check${pendingCount !== 1 ? 's' : ''} pending`;

  return (
    <div
      className="ci-pill"
      style={{ background: bg, color: fg, position: 'relative' }}
      aria-label={`CI checks: ${ciStatus.aggregate} — ${ciStatus.checks.length} checks`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{ background: 'transparent', color: 'inherit', border: 'none' }}
      >
        {label}
      </button>
      {expanded && (
        <div
          className="ci-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            minWidth: 220,
            background: 'var(--paper-1)',
            border: '1px solid var(--ink-5)',
            borderRadius: 6,
            padding: 6,
            zIndex: 10,
          }}
        >
          {ciStatus.checks.map((c) => (
            <div key={c.name} className="ci-row">
              {c.name} · {c.bucket}{' '}
              {c.link && (
                <a href={c.link} target="_blank" rel="noreferrer">
                  ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StageStepper({
  summary,
  selfReview,
  activeCategory,
  onSummaryStep,
  onSelfReviewStep,
  onCategoryClick,
}: {
  summary?: PrSummary | null;
  selfReview?: SelfReview | null;
  activeCategory: ChecklistCategory | null;
  onSummaryStep: () => void;
  onSelfReviewStep: () => void;
  onCategoryClick: (cat: ChecklistCategory | null) => void;
}) {
  const steps = [
    {
      label: 'Summary',
      sub: summary
        ? `${summary.intent} · ${Math.round(summary.intentConfidence * 100)}% confident`
        : 'Not generated',
      status: summary ? 'done' : 'active',
      onClick: summary ? onSummaryStep : undefined,
      disabled: false,
    },
    {
      label: 'Self-review',
      sub: selfReview
        ? `${selfReview.findings.length} finding${selfReview.findings.length !== 1 ? 's' : ''}`
        : 'Not run',
      status: selfReview ? 'done' : summary ? 'active' : 'default',
      onClick: selfReview ? onSelfReviewStep : undefined,
      disabled: false,
    },
    {
      label: 'Walkthrough',
      sub: 'Phase 5',
      status: 'default',
      onClick: undefined,
      disabled: true,
      tooltip: 'Walkthrough available in Phase 5',
    },
    {
      label: 'Submit',
      sub: 'Phase 6',
      status: 'default',
      onClick: undefined,
      disabled: true,
      tooltip: 'Submit available in Phase 6',
    },
  ];

  return (
    <div className="stages" role="list" aria-label="Review stages">
      {steps.map((s, i) => (
        <Fragment key={s.label}>
          <div
            className={cn('stage', s.status === 'done' && 'done', s.status === 'active' && 'active', s.disabled && 'disabled')}
            role="listitem"
            aria-current={s.status === 'active' ? 'step' : undefined}
            aria-disabled={s.disabled || undefined}
            title={('tooltip' in s && s.tooltip) ? s.tooltip as string : undefined}
            onClick={s.disabled ? undefined : s.onClick}
            style={s.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : s.onClick ? { cursor: 'pointer' } : undefined}
          >
            <div className="num">{s.status === 'done' ? <Ic.check /> : i + 1}</div>
            <div className="meta">
              <div className="label">{s.label}</div>
              <div className="sub">{s.sub}</div>
            </div>
          </div>
          {i < steps.length - 1 && (
            <div className="stage-connector">
              <Ic.chev />
            </div>
          )}
        </Fragment>
      ))}
      {selfReview && (
        <div className="stages-coverage-strip" role="group" aria-label="Category coverage">
          {CATEGORIES.map((cat) => {
            const count = selfReview.findings.filter((f) => f.category === cat).length;
            const coverageStatus = selfReview.coverage[cat];
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                className={cn(`coverage-chip`, `coverage-chip--${coverageStatus}`, isActive && 'active')}
                onClick={() => onCategoryClick(isActive ? null : cat)}
                aria-label={`${cat}: ${coverageStatus}`}
              >
                {CAT_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
