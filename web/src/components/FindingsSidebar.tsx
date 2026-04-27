import { useState } from 'react';
import type { ChecklistCategory, ResolvedFinding, SelfReview, Severity } from '@shared/types';
import { postUserRequest } from '../api';

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
}

export function FindingsSidebar({
  selfReview,
  activeCategory,
  onCategoryClick,
  onFindingClick,
  prKey,
}: FindingsSidebarProps) {
  const [filter, setFilter] = useState<FilterMode>('all');

  if (!selfReview) {
    return (
      <div className="findings-panel">
        <div className="findings-panel-header">
          <div className="findings-stage-label">Stage 3 · Review</div>
          <div className="findings-title">Findings</div>
          <div className="findings-subtitle">
            <span className="generating-pulse">Running self-review...</span>
          </div>
        </div>
      </div>
    );
  }

  const allFindings = selfReview.findings
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const blockerCount = allFindings.filter(f => f.severity === 'blocker').length;
  const openCount = allFindings.length;

  const filtered = filter === 'blockers'
    ? allFindings.filter(f => f.severity === 'blocker')
    : allFindings;

  async function handleAsk(finding: ResolvedFinding) {
    if (!prKey) return;
    try {
      await postUserRequest(prKey, { type: 'chat', payload: { message: `Tell me more about this finding: "${finding.title}" at ${finding.path}:${finding.line}` } });
    } catch { /* chat panel surfaces errors */ }
  }

  return (
    <div className="findings-panel">
      <div className="findings-panel-header">
        <div className="findings-stage-label">Stage 3 · Review</div>
        <div className="findings-title">Findings · ranked by severity</div>
        <div className="findings-subtitle">
          {blockerCount > 0 && <span className="findings-blocker-count">{blockerCount} blocker{blockerCount !== 1 ? 's' : ''}</span>}
          {blockerCount > 0 && ' · '}{openCount} open
        </div>
        <div className="findings-filter-tabs">
          <button type="button" className={`findings-filter-tab${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button type="button" className={`findings-filter-tab${filter === 'open' ? ' active' : ''}`} onClick={() => setFilter('open')}>Open</button>
          <button type="button" className={`findings-filter-tab${filter === 'blockers' ? ' active' : ''}`} onClick={() => setFilter('blockers')}>Blockers</button>
        </div>
      </div>

      <div className="findings-cards">
        {filtered.map((f, i) => (
          <div
            key={f.id}
            className={`findings-card findings-card--${f.severity}`}
            onClick={() => onFindingClick(f.lineId)}
          >
            <div className="findings-card-num">{i + 1}</div>
            <div className="findings-card-meta">
              <span className={`findings-severity-badge findings-severity-badge--${f.severity}`}>
                {SEVERITY_LABEL[f.severity]}
              </span>
              <span className="findings-category-label">{CAT_LABELS[f.category]}</span>
            </div>
            <div className="findings-card-title">{f.title}</div>
            <div className="findings-card-desc">{f.rationale}</div>
            <div className="findings-card-footer">
              <span className="findings-card-file">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {f.path} :{f.line}
              </span>
              <button
                type="button"
                className="findings-card-ask"
                onClick={(e) => { e.stopPropagation(); handleAsk(f); }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>
                Ask
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
