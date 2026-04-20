import { useState } from 'react';
import type { PrSummary, SummaryIntent } from '@shared/types';

const INTENT_CLASS: Record<SummaryIntent, string> = {
  'bug-fix': 'intent-chip--bug-fix',
  feature: 'intent-chip--feature',
  refactor: 'intent-chip--refactor',
  chore: 'intent-chip--chore',
  other: 'intent-chip--other',
};

interface SummaryDrawerProps {
  summary: PrSummary | null | undefined;
  authorDescription?: string;
  open: boolean;
  onClose: () => void;
  onRegenerate?: () => void;
}

export function SummaryDrawer({
  summary,
  authorDescription,
  open,
  onClose,
  onRegenerate,
}: SummaryDrawerProps) {
  if (!open || !summary) return null;

  const [paraphraseExpanded, setParaphraseExpanded] = useState(false);
  const [authorExpanded, setAuthorExpanded] = useState(false);

  return (
    <div className="summary-drawer" role="region" aria-label="PR summary">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className={`intent-chip ${INTENT_CLASS[summary.intent]}`}>
            {summary.intent}
          </span>
          <span style={{ marginLeft: 8, fontSize: 11, fontFamily: 'monospace', color: 'var(--ink-4)' }}>
            {Math.round(summary.intentConfidence * 100)}% confidence
          </span>
        </div>
        <button type="button" className="topbtn" onClick={onClose} aria-label="Close summary">×</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <p className={paraphraseExpanded ? '' : 'line-clamp-3'}>
          {summary.paraphrase}
        </p>
        {summary.paraphrase.length > 200 && (
          <button
            type="button"
            className="text-btn"
            onClick={() => setParaphraseExpanded((v) => !v)}
          >
            {paraphraseExpanded ? 'Collapse' : 'Read more'}
          </button>
        )}
      </div>

      {authorDescription && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="text-btn"
            onClick={() => setAuthorExpanded((v) => !v)}
          >
            {authorExpanded ? '▾' : '▸'} Author&apos;s description
          </button>
          {authorExpanded && (
            <div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--paper-2)', borderRadius: 4, fontSize: 12, color: 'var(--ink-3)' }}>
              {authorDescription}
            </div>
          )}
        </div>
      )}

      {summary.keyChanges.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Key changes</h4>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {summary.keyChanges.map((kc, i) => (
              <li key={i} style={{ fontSize: 13 }}>{kc}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Risk areas</h4>
        {summary.riskAreas.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {summary.riskAreas.map((ra, i) => (
              <li key={i} style={{ fontSize: 13 }}>⚠ {ra}</li>
            ))}
          </ul>
        ) : (
          <p style={{ fontStyle: 'italic', color: 'var(--ink-4)', fontSize: 12 }}>
            No specific risk areas flagged.
          </p>
        )}
      </div>

      {onRegenerate && (
        <div style={{ marginTop: 16 }}>
          <button type="button" className="topbtn" onClick={onRegenerate}>
            Regenerate summary
          </button>
        </div>
      )}
    </div>
  );
}
