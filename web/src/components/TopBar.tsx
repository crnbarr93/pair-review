import { Fragment, useState } from 'react';
import type { CIStatus, PrSummary, PullRequestMeta, SelfReview, SubmissionState, Walkthrough } from '@shared/types';
import { Ic } from './icons';

function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

type ReviewStep = 'summary' | 'walkthrough' | 'review' | 'submission';

interface TopBarProps {
  pr: PullRequestMeta;
  ciStatus?: CIStatus;
  summary?: PrSummary | null;
  selfReview?: SelfReview | null;
  walkthrough?: Walkthrough | null;
  submissionState: SubmissionState | null;
  activeStep: ReviewStep;
  onStepClick: (step: ReviewStep) => void;
  onSettingsClick: () => void;
  onSubmitReview: () => void;
}

export function TopBar({
  pr,
  ciStatus,
  summary,
  selfReview,
  walkthrough,
  submissionState,
  activeStep,
  onStepClick,
  onSettingsClick,
  onSubmitReview,
}: TopBarProps) {
  const hasGhCoords =
    pr.source === 'github' &&
    !!pr.owner &&
    !!pr.repo &&
    typeof pr.number === 'number';

  return (
    <header className="topbar-shell">
      {/* Row 1: PR info */}
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
          <span style={{ color: 'var(--ink-4)' }}>&#8594;</span> {pr.baseBranch}
        </div>
        <CIPill ciStatus={ciStatus} />
        <div className="spacer" />
        <button type="button" className="topbtn" onClick={onSettingsClick}>
          <Ic.settings /> Settings
        </button>
        {submissionState?.status === 'submitted' ? (
          <span className="topbtn" style={{ color: 'var(--ok)', fontWeight: 600 }}>
            Review posted
          </span>
        ) : (
          <button type="button" className="primary" onClick={onSubmitReview}>
            Submit review
          </button>
        )}
      </div>
      {/* Row 2: Step navigation */}
      <StepNav
        activeStep={activeStep}
        onStepClick={onStepClick}
        summary={summary}
        selfReview={selfReview}
        walkthrough={walkthrough}
        submissionState={submissionState}
      />
    </header>
  );
}

function StepNav({
  activeStep,
  onStepClick,
  summary,
  selfReview,
  walkthrough,
  submissionState,
}: {
  activeStep: ReviewStep;
  onStepClick: (step: ReviewStep) => void;
  summary?: PrSummary | null;
  selfReview?: SelfReview | null;
  walkthrough?: Walkthrough | null;
  submissionState?: SubmissionState | null;
}) {
  const steps: Array<{
    key: ReviewStep;
    label: string;
    sub: string;
    subGenerating?: boolean;
    status: 'done' | 'active' | 'default';
  }> = [
    {
      key: 'summary',
      label: 'Summary',
      sub: summary
        ? `${summary.intent} · ${Math.round(summary.intentConfidence * 100)}%`
        : 'Generating',
      subGenerating: !summary,
      status: summary ? 'done' : 'active',
    },
    {
      key: 'walkthrough',
      label: 'Walkthrough',
      sub: walkthrough
        ? `${walkthrough.steps.filter(s => s.status === 'visited').length}/${walkthrough.steps.length} steps`
        : summary ? 'Generating' : 'Not started',
      subGenerating: !walkthrough && !!summary,
      status: walkthrough
        ? walkthrough.steps.every(s => s.status !== 'pending') ? 'done' : 'active'
        : summary ? 'active' : 'default',
    },
    {
      key: 'review',
      label: 'Review',
      sub: selfReview
        ? `${selfReview.findings.length} finding${selfReview.findings.length !== 1 ? 's' : ''}`
        : walkthrough ? 'Running' : 'Not run',
      subGenerating: !selfReview && !!walkthrough,
      status: selfReview ? 'done' : walkthrough ? 'active' : 'default',
    },
    {
      key: 'submission',
      label: 'Submit',
      sub: submissionState?.status === 'submitted'
        ? 'Review posted'
        : submissionState?.status === 'submitting'
          ? 'Posting...'
          : selfReview ? 'Ready to submit' : 'Not submitted',
      status: submissionState?.status === 'submitted'
        ? 'done'
        : selfReview ? 'active' : 'default',
    },
  ];

  return (
    <div className="stages" role="list" aria-label="Review stages">
      {steps.map((s, i) => {
        const isActive = activeStep === s.key;
        return (
          <Fragment key={s.key}>
            <div
              className={cn(
                'stage',
                s.status === 'done' && 'done',
                isActive && 'active',
              )}
              role="listitem"
              aria-current={isActive ? 'step' : undefined}
              onClick={() => onStepClick(s.key)}
              style={{ cursor: 'pointer' }}
            >
              <div className="num">
                {s.status === 'done' ? <Ic.check /> : i + 1}
              </div>
              <div className="meta">
                <div className="label">{s.label}</div>
                <div className={cn('sub', s.subGenerating && 'generating-text')}>{s.sub}</div>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="stage-connector">
                <Ic.chev />
              </div>
            )}
          </Fragment>
        );
      })}
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
