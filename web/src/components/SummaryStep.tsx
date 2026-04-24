import { useState } from 'react';
import type { PrSummary, SummaryIntent, PullRequestMeta } from '@shared/types';
import { postUserRequest } from '../api';

const INTENT_CLASS: Record<SummaryIntent, string> = {
  'bug-fix': 'intent-chip--bug-fix',
  feature: 'intent-chip--feature',
  refactor: 'intent-chip--refactor',
  chore: 'intent-chip--chore',
  other: 'intent-chip--other',
};

interface SummaryStepProps {
  summary: PrSummary;
  authorDescription?: string;
  pr?: PullRequestMeta;
  prKey: string;
}

export function SummaryStep({ summary, authorDescription, pr, prKey }: SummaryStepProps) {
  const [activeTab, setActiveTab] = useState<'claude' | 'author'>('claude');

  async function handleAsk(message: string) {
    if (!prKey) return;
    try {
      await postUserRequest(prKey, { type: 'chat', payload: { message } });
    } catch {
      // Silently fail — chat panel will surface errors
    }
  }

  const filesChanged = pr?.filesChanged ?? 0;
  const additions = pr?.additions ?? 0;
  const deletions = pr?.deletions ?? 0;

  return (
    <div className="summary-step">
      {/* Stats grid */}
      <div className="summary-stats-grid">
        <div className="summary-stat-card">
          <div className="stat-value">{filesChanged}</div>
          <div className="stat-label">Files changed</div>
        </div>
        <div className="summary-stat-card">
          <div className="stat-value">+{additions}</div>
          <div className="stat-label">Lines added</div>
        </div>
        <div className="summary-stat-card">
          <div className="stat-value">-{deletions}</div>
          <div className="stat-label">Lines removed</div>
        </div>
        <div className="summary-stat-card">
          <div className="stat-value">PR</div>
          <div className="stat-label">Commits</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="summary-tabs">
        <button
          type="button"
          className={`summary-tab${activeTab === 'claude' ? ' active' : ''}`}
          onClick={() => setActiveTab('claude')}
        >
          Claude&apos;s summary
          <span className="tab-badge tab-badge--auto">AUTO</span>
        </button>
        <button
          type="button"
          className={`summary-tab${activeTab === 'author' ? ' active' : ''}`}
          onClick={() => setActiveTab('author')}
        >
          Author&apos;s description
          <span className="tab-badge tab-badge--original">ORIGINAL</span>
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'claude' && (
        <>
          {/* Intent + confidence */}
          <div className="summary-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span className={`intent-chip ${INTENT_CLASS[summary.intent]}`}>
                {summary.intent}
              </span>
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--ink-4)' }}>
                {Math.round(summary.intentConfidence * 100)}% confidence
              </span>
            </div>
          </div>

          {/* Paraphrase */}
          <div className="summary-section">
            <div className="summary-section-header">
              <h4>Summary</h4>
              <button
                type="button"
                className="summary-ask-btn"
                onClick={() => handleAsk('Can you explain the purpose of this PR in more detail?')}
              >
                Ask
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
              {summary.paraphrase}
            </p>
          </div>

          {/* Key changes */}
          {summary.keyChanges.length > 0 && (
            <div className="summary-section">
              <div className="summary-section-header">
                <h4>What changed</h4>
                <button
                  type="button"
                  className="summary-ask-btn"
                  onClick={() => handleAsk('Can you walk me through the key changes in this PR?')}
                >
                  Ask
                </button>
              </div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {summary.keyChanges.map((kc, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>
                    {kc}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risk areas */}
          <div className="summary-section">
            <div className="summary-section-header">
              <h4>Risk areas</h4>
              <button
                type="button"
                className="summary-ask-btn"
                onClick={() => handleAsk('What are the main risks I should focus on when reviewing this PR?')}
              >
                Ask
              </button>
            </div>
            {summary.riskAreas.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {summary.riskAreas.map((ra, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>
                    {ra}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontStyle: 'italic', color: 'var(--ink-4)', fontSize: 12, margin: 0 }}>
                No specific risk areas flagged.
              </p>
            )}
          </div>
        </>
      )}

      {activeTab === 'author' && (
        <div className="summary-section">
          {authorDescription ? (
            <div className="summary-author-block">{authorDescription}</div>
          ) : (
            <div className="summary-author-block" style={{ fontStyle: 'italic', color: 'var(--ink-4)' }}>
              No description provided.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
