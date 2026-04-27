import { useState } from 'react';
import type { ChecklistCategory, ResolvedFinding, SelfReview, Severity } from '@shared/types';
import { postUserRequest, postSessionEvent } from '../api';
import { ReviewLoadingState } from './LoadingSkeletons';

const SEVERITY_ORDER: Record<Severity, number> = { blocker: 0, major: 1, minor: 2, nit: 3 };
const SEVERITY_LABEL: Record<Severity, string> = { blocker: 'BLOCKER', major: 'WARNING', minor: 'WARNING', nit: 'NIT' };
const CAT_LABELS: Record<ChecklistCategory, string> = {
  correctness: 'CORRECTNESS',
  security: 'SECURITY',
  tests: 'TESTS',
  performance: 'PERFORMANCE',
  style: 'STYLE',
};

type FilterMode = 'all' | 'open' | 'blockers';

interface FindingsSidebarProps {
  selfReview: SelfReview | null | undefined;
  activeCategory: ChecklistCategory | null;
  onCategoryClick: (cat: ChecklistCategory | null) => void;
  onFindingClick: (lineId: string) => void;
  prKey?: string;
  activeFindingId?: string | null;
}

export function FindingsSidebar({
  selfReview,
  activeCategory,
  onCategoryClick,
  onFindingClick,
  prKey,
  activeFindingId,
}: FindingsSidebarProps) {
  const [filter, setFilter] = useState<FilterMode>('all');

  if (!selfReview) {
    return <ReviewLoadingState />;
  }

  const allFindings = selfReview.findings
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const blockerCount = allFindings.filter(f => f.severity === 'blocker').length;
  const dismissedCount = allFindings.filter(f => f.validity === 'invalid').length;
  const openCount = allFindings.filter(f => f.validity !== 'invalid').length;

  const filtered = (() => {
    if (filter === 'blockers') return allFindings.filter(f => f.severity === 'blocker');
    if (filter === 'open') return allFindings.filter(f => f.validity !== 'invalid');
    return allFindings;
  })();

  async function handleAsk(finding: ResolvedFinding) {
    if (!prKey) return;
    try {
      await postUserRequest(prKey, { type: 'chat', payload: { message: `Tell me more about this finding: "${finding.title}" at ${finding.path}:${finding.line}` } });
    } catch { /* chat panel surfaces errors */ }
  }

  async function handleValidityToggle(finding: ResolvedFinding, validity: 'valid' | 'invalid') {
    if (!prKey) return;
    try {
      await postSessionEvent(prKey, { type: 'finding.validitySet', findingId: finding.id, validity });
    } catch { /* server errors are non-critical for this toggle */ }
  }

  function getSeverityColor(severity: Severity): string {
    if (severity === 'blocker') return 'var(--block)';
    if (severity === 'major' || severity === 'minor') return 'var(--warn)';
    return 'var(--ink-4)';
  }

  return (
    <div className="findings-panel">
      <div className="findings-panel-header">
        <div className="findings-stage-label">Stage 3 · Review</div>
        <div className="findings-title">Findings · ranked by severity</div>
        <div className="findings-subtitle">
          {blockerCount > 0 && <span className="findings-blocker-count">{blockerCount} blocker{blockerCount !== 1 ? 's' : ''}</span>}
          {blockerCount > 0 && ' · '}{openCount} open
          {dismissedCount > 0 && `, ${dismissedCount} dismissed`}
        </div>
        <div className="findings-filter-tabs">
          <button type="button" className={`findings-filter-tab${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button type="button" className={`findings-filter-tab${filter === 'open' ? ' active' : ''}`} onClick={() => setFilter('open')}>Open</button>
          <button type="button" className={`findings-filter-tab${filter === 'blockers' ? ' active' : ''}`} onClick={() => setFilter('blockers')}>Blockers</button>
        </div>
      </div>

      <div className="findings-cards">
        {filtered.map((f, i) => {
          const isActive = activeFindingId === f.id;
          const isInvalid = f.validity === 'invalid';
          const isValid = f.validity === 'valid';
          const sevColor = getSeverityColor(f.severity);

          return (
            <div
              key={f.id}
              className={`findings-card findings-card--${f.severity}${isActive ? ' findings-card--active' : ''}${isInvalid ? ' findings-card--invalid' : ''}`}
              style={isActive ? { borderLeft: `3px solid ${sevColor}` } : undefined}
              onClick={() => onFindingClick(f.lineId)}
            >
              <div className="findings-card-num">{i + 1}</div>

              {/* Dual badge layout: severity + category */}
              <div className="findings-card-meta">
                <span className={`findings-severity-badge findings-severity-badge--${f.severity}`}>
                  {SEVERITY_LABEL[f.severity]}
                </span>
                <span className="findings-category-badge">
                  {CAT_LABELS[f.category]}
                </span>
              </div>

              <div className={`findings-card-title${isInvalid ? ' findings-card-title--struck' : ''}`}>{f.title}</div>
              <div className="findings-card-desc">{f.rationale}</div>

              <div className="findings-card-footer">
                <span className="findings-card-file">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  {f.path}:{f.line}
                </span>
                <button
                  type="button"
                  className="findings-card-ask"
                  onClick={(e) => { e.stopPropagation(); void handleAsk(f); }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>
                  Ask
                </button>
              </div>

              {/* Validity toggle (D-13) */}
              <div className="findings-validity" onClick={(e) => e.stopPropagation()}>
                <span className="findings-validity-label">IS THIS FINDING VALID?</span>
                <div className="findings-validity-buttons">
                  <button
                    type="button"
                    className={`findings-validity-btn findings-validity-btn--valid${isValid ? ' findings-validity-btn--active' : ''}`}
                    onClick={() => void handleValidityToggle(f, 'valid')}
                    title="Mark as valid"
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Valid
                  </button>
                  <button
                    type="button"
                    className={`findings-validity-btn findings-validity-btn--invalid${isInvalid ? ' findings-validity-btn--active' : ''}`}
                    onClick={() => void handleValidityToggle(f, 'invalid')}
                    title="Dismiss finding"
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    Invalid
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
