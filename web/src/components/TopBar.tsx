import { Fragment, useState } from 'react';
import type { ChecklistCategory, CIStatus, PrSummary, PullRequestMeta, SelfReview, Walkthrough } from '@shared/types';
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

const CI_PALETTE: Record<string, { bg: string; fg: string; dot: string }> = {
  pass: { bg: 'var(--ok-bg)', fg: 'var(--ok)', dot: 'var(--ok)' },
  fail: { bg: 'var(--block-bg)', fg: 'var(--block)', dot: 'var(--block)' },
  pending: { bg: 'var(--warn-bg)', fg: 'var(--warn)', dot: 'var(--warn)' },
  none: { bg: 'var(--paper-2)', fg: 'var(--ink-4)', dot: 'var(--ink-4)' },
};

const BUCKET_LABEL: Record<string, string> = {
  pass: 'PASS', fail: 'FAIL', pending: 'RUNNING', skipping: 'SKIP', cancel: 'CANCEL',
};

function CIPill({ ciStatus }: { ciStatus: CIStatus | undefined }) {
  const [expanded, setExpanded] = useState(false);
  if (!ciStatus || ciStatus.aggregate === 'none') return null;

  const { bg, fg } = CI_PALETTE[ciStatus.aggregate] ?? CI_PALETTE.none;
  const total = ciStatus.checks.length;
  const passCount = ciStatus.checks.filter((c) => c.bucket === 'pass').length;
  const failCount = ciStatus.checks.filter((c) => c.bucket === 'fail').length;

  const label =
    ciStatus.aggregate === 'pass'
      ? `All checks passed | ${passCount}/${total}`
      : ciStatus.aggregate === 'fail'
        ? `${failCount} check${failCount !== 1 ? 's' : ''} failing | ${passCount}/${total}`
        : `Checks running | ${passCount}/${total}`;

  return (
    <div className="ci-pill" style={{ position: 'relative' }}>
      <button
        type="button"
        className="ci-pill-btn"
        style={{ background: bg, color: fg }}
        onClick={() => setExpanded((v) => !v)}
        aria-label={`CI checks: ${ciStatus.aggregate} — ${total} checks`}
        aria-expanded={expanded}
      >
        {ciStatus.aggregate === 'pass' && <Ic.check />}
        {label}
      </button>
      {expanded && (
        <>
          <div className="ci-backdrop" onClick={() => setExpanded(false)} />
          <div className="ci-dropdown">
            <div className="ci-dropdown-header">
              Continuous integration
            </div>
            <div className="ci-dropdown-body">
              {ciStatus.checks.map((c) => {
                const bucketStyle = CI_PALETTE[c.bucket] ?? CI_PALETTE.none;
                return (
                  <div key={c.name} className="ci-check-row">
                    <span className="ci-dot" style={{ background: bucketStyle.dot }} />
                    <span className="ci-check-name">{c.name}</span>
                    <span className="ci-check-spacer" />
                    <span
                      className="ci-check-badge"
                      style={{ background: bucketStyle.bg, color: bucketStyle.fg }}
                    >
                      {BUCKET_LABEL[c.bucket] ?? c.bucket.toUpperCase()}
                    </span>
                    {c.link && (
                      <a href={c.link} target="_blank" rel="noreferrer" className="ci-check-link" aria-label={`Open ${c.name} details`}>
                        ↗
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="ci-dropdown-footer">
              <button type="button" className="ci-rerun-btn">Re-run all</button>
              {ciStatus.checks[0]?.link && (
                <a
                  href={ciStatus.checks[0].link.replace(/\/[^/]*$/, '')}
                  target="_blank"
                  rel="noreferrer"
                  className="ci-open-link"
                >
                  Open in CI ↗
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function StageStepper({
  summary,
  selfReview,
  activeCategory,
  walkthrough,
  onSummaryStep,
  onSelfReviewStep,
  onCategoryClick,
  onWalkthroughStepClick,
  onShowAllToggle,
}: {
  summary?: PrSummary | null;
  selfReview?: SelfReview | null;
  activeCategory: ChecklistCategory | null;
  walkthrough?: Walkthrough | null;
  onSummaryStep: () => void;
  onSelfReviewStep: () => void;
  onCategoryClick: (cat: ChecklistCategory | null) => void;
  onWalkthroughStepClick?: (cursor: number) => void;
  onShowAllToggle?: (showAll: boolean) => void;
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
      sub: walkthrough
        ? `${walkthrough.steps.filter(s => s.status === 'visited').length}/${walkthrough.steps.length} steps`
        : 'Not started',
      status: walkthrough ? (walkthrough.steps.every(s => s.status !== 'pending') ? 'done' : 'active') : selfReview ? 'active' : 'default',
      onClick: undefined,
      disabled: !walkthrough,
      tooltip: !walkthrough ? 'Ask Claude to set_walkthrough' : undefined,
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
