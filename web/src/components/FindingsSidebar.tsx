import { useState } from 'react';
import type { ChecklistCategory, ResolvedFinding, SelfReview, Severity } from '@shared/types';

function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

const SEVERITY_ORDER: Record<Severity, number> = { blocker: 0, major: 1, minor: 2, nit: 3 };
const CATEGORIES: ChecklistCategory[] = ['correctness', 'security', 'tests', 'performance', 'style'];
const CAT_LABELS: Record<ChecklistCategory, string> = {
  correctness: 'Correctness',
  security: 'Security',
  tests: 'Tests',
  performance: 'Performance',
  style: 'Style',
};

interface FindingsSidebarProps {
  selfReview: SelfReview | null | undefined;
  open: boolean;
  onClose: () => void;
  activeCategory: ChecklistCategory | null;
  onCategoryClick: (cat: ChecklistCategory | null) => void;
  onFindingClick: (lineId: string) => void;
}

export function FindingsSidebar({
  selfReview,
  open,
  onClose,
  activeCategory,
  onCategoryClick,
  onFindingClick,
}: FindingsSidebarProps) {
  if (!open) return null;

  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);

  if (!selfReview) {
    return (
      <aside className="findings-sidebar" role="complementary" aria-label="Code review findings">
        <div className="findings-sidebar-header">
          <h3>Findings</h3>
          <button type="button" className="topbtn" onClick={onClose} aria-label="Close findings">×</button>
        </div>
        <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink-4)' }}>
          <p style={{ fontWeight: 500, marginBottom: 8 }}>Self-review not run yet</p>
          <p style={{ fontSize: 12 }}>Ask Claude to run_self_review to see findings here.</p>
        </div>
      </aside>
    );
  }

  const visibleCategories = activeCategory ? [activeCategory] : CATEGORIES;

  const handleFindingClick = (finding: ResolvedFinding) => {
    onFindingClick(finding.lineId);
    setActiveFindingId(finding.id);
    setTimeout(() => setActiveFindingId(null), 1500);
  };

  const toggleFindingExpand = (id: string) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="findings-sidebar" role="complementary" aria-label="Code review findings">
      <div className="findings-sidebar-header">
        <h3>
          Findings ({selfReview.findings.length})
          {activeCategory && (
            <button
              type="button"
              className="filter-badge"
              onClick={() => onCategoryClick(null)}
              aria-label="Clear category filter"
            >
              {CAT_LABELS[activeCategory]} ×
            </button>
          )}
        </h3>
        <button type="button" className="topbtn" onClick={onClose} aria-label="Close findings">×</button>
      </div>

      {visibleCategories.map((cat) => {
        const findings = selfReview.findings
          .filter((f) => f.category === cat)
          .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

        return (
          <div key={cat} className="findings-category">
            <div
              className="findings-category-header"
              onClick={() => onCategoryClick(activeCategory === cat ? null : cat)}
              role="button"
              tabIndex={0}
              aria-label={`${CAT_LABELS[cat]} category: ${findings.length} findings`}
            >
              <span>{CAT_LABELS[cat]}</span>
              <span className="findings-count">({findings.length})</span>
            </div>
            {findings.map((f) => (
              <div
                key={f.id}
                className={cn('findings-row', activeFindingId === f.id && 'active')}
              >
                <span
                  className={`severity-pill severity-pill--${f.severity}`}
                  aria-label={`${f.severity} severity`}
                >
                  {f.severity}
                </span>
                <button
                  type="button"
                  className="findings-file-ref"
                  onClick={() => handleFindingClick(f)}
                  aria-label={`${f.path} line ${f.line}`}
                >
                  {f.path}:{f.line}
                </button>
                <button
                  type="button"
                  className="findings-title"
                  onClick={() => toggleFindingExpand(f.id)}
                >
                  {f.title}
                </button>
                {expandedFindings.has(f.id) && (
                  <div className="findings-rationale">
                    {f.rationale}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </aside>
  );
}
