// TopBar + StageStepper — Phase 3: live-wired to store props per D-25, D-26.
// StageStepper export retained on disk (Phase 4 mounts it — D-02 keeps it off in Phase 3).
import { Fragment, useState } from 'react';
import type { CIStatus, PullRequestMeta } from '@shared/types';
import { Ic } from './icons';

function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

interface TopBarProps {
  pr: PullRequestMeta;
  ciStatus?: CIStatus;
  onSettingsClick: () => void;
  onRequestChanges: () => void;
  onApprove: () => void;
}

export function TopBar({
  pr,
  ciStatus,
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

// Phase 3 does not mount StageStepper (D-02), but the export stays on disk so
// Phase 4 can import it without a file rename. Keep the legacy signature.
export function StageStepper({
  stages,
  active,
  onPick,
}: {
  stages: Array<{ id: string; label: string; sub: string; status?: string }>;
  active: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="stages">
      {stages.map((s, i) => (
        <Fragment key={s.id}>
          <div
            className={cn(
              'stage',
              s.status === 'done' && 'done',
              s.id === active && 'active'
            )}
            onClick={() => onPick(s.id)}
          >
            <div className="num">{s.status === 'done' ? <Ic.check /> : i + 1}</div>
            <div className="meta">
              <div className="label">{s.label}</div>
              <div className="sub">{s.sub}</div>
            </div>
          </div>
          {i < stages.length - 1 && (
            <div className="stage-connector">
              <Ic.chev />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}
