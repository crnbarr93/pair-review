import { useState } from 'react';
import type { PrSummary, SummaryIntent, PullRequestMeta } from '@shared/types';
import { postUserRequest } from '../api';

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
  const commits = 0;

  return (
    <div className="summary-step">
      <div className="summary-content">
        {/* Stage header + toggle row */}
        <div className="summary-stage-label">Stage 1 · Summary</div>
        <div className="summary-header-row">
          <div>
            <h2 className="summary-heading">What this PR does</h2>
            <div className="summary-subtitle">
              Claude read the diff and wrote this · last run 2m ago
            </div>
          </div>
          <div className="summary-toggle">
          <button
            type="button"
            className={`summary-toggle-btn${activeTab === 'claude' ? ' active' : ''}`}
            onClick={() => setActiveTab('claude')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            Claude&apos;s summary
            <span className="toggle-badge toggle-badge--auto">auto</span>
          </button>
          <button
            type="button"
            className={`summary-toggle-btn${activeTab === 'author' ? ' active' : ''}`}
            onClick={() => setActiveTab('author')}
          >
            <span className="toggle-avatar">m</span>
            Author&apos;s description
            <span className="toggle-badge toggle-badge--original">original</span>
          </button>
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'claude' && (
          <>
            {/* TL;DR card */}
            <div className="summary-tldr">
              <div className="summary-tldr-label">TL;DR</div>
              <p className="summary-tldr-text">{summary.paraphrase}</p>
            </div>

            {/* Stats grid */}
            <div className="summary-stats-grid">
              <div className="summary-stat-card">
                <div className="stat-value">{filesChanged}</div>
                <div className="stat-label">files</div>
              </div>
              <div className="summary-stat-card">
                <div className="stat-value stat-value--add">+{additions}</div>
                <div className="stat-label">added</div>
              </div>
              <div className="summary-stat-card">
                <div className="stat-value stat-value--rem">&minus;{deletions}</div>
                <div className="stat-label">removed</div>
              </div>
              <div className="summary-stat-card">
                <div className="stat-value">{commits || '—'}</div>
                <div className="stat-label">commits</div>
              </div>
            </div>

            {/* Why */}
            <div className="summary-section">
              <div className="summary-section-header">
                <h3>Why</h3>
                <button
                  type="button"
                  className="summary-ask-btn"
                  onClick={() => handleAsk('Can you explain the purpose of this PR in more detail?')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>
                  Ask
                </button>
              </div>
              <p className="summary-body-text">{summary.paraphrase}</p>
            </div>

            {/* What changed */}
            {summary.keyChanges.length > 0 && (
              <div className="summary-section">
                <div className="summary-section-header">
                  <h3>What changed</h3>
                  <button
                    type="button"
                    className="summary-ask-btn"
                    onClick={() => handleAsk('Can you walk me through the key changes in this PR?')}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>
                    Ask
                  </button>
                </div>
                <div className="summary-changes-list">
                  {summary.keyChanges.map((kc, i) => (
                    <p key={i} className="summary-body-text">{kc}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Risk & rollout */}
            <div className="summary-section">
              <div className="summary-section-header">
                <h3>Risk &amp; rollout</h3>
                <button
                  type="button"
                  className="summary-ask-btn"
                  onClick={() => handleAsk('What are the main risks I should focus on when reviewing this PR?')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>
                  Ask
                </button>
              </div>
              {summary.riskAreas.length > 0 ? (
                <div className="summary-changes-list">
                  {summary.riskAreas.map((ra, i) => (
                    <p key={i} className="summary-body-text">{ra}</p>
                  ))}
                </div>
              ) : (
                <p className="summary-body-text" style={{ fontStyle: 'italic', color: 'var(--ink-4)' }}>
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
    </div>
  );
}
