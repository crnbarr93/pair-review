import { Ic } from './icons';

function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

function LoadingStatus({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="ctx-loading-status">
      <span className="live-dot" />
      <span className="ctx-loading-label">{label}</span>
      {sub && <span className="ctx-loading-substep">{sub}</span>}
    </div>
  );
}

function LoadingBar() {
  return <div className="ctx-loading-bar" aria-hidden="true" />;
}

function LoadingStageChips({ stages }: { stages: Array<{ label: string; state: 'done' | 'active' | 'pending' }> }) {
  return (
    <div className="ctx-loading-stages">
      {stages.map((s, i) => (
        <span key={i} className={cn('ctx-loading-stage', s.state)}>
          <span className="ctx-loading-stage-glyph">
            {s.state === 'done' && <Ic.check />}
          </span>
          {s.label}
        </span>
      ))}
    </div>
  );
}

// ── Summary loading (Stage 1) ──
// Mirrors the real SummaryStep layout: TL;DR card, stats grid, prose sections.

export function SummaryLoadingState() {
  return (
    <div className="summary-step">
      <div className="summary-content summary-loading-content">
        <div className="summary-stage-label">Stage 1 · Summary</div>
        <div className="summary-header-row">
          <div>
            <h2 className="summary-heading">What this PR does</h2>
            <LoadingStatus label="Claude is reading the diff…" sub="scanning files" />
          </div>
          <div className="summary-toggle">
            <button type="button" className="summary-toggle-btn active">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" /></svg>
              Claude&apos;s summary
              <span className="toggle-badge toggle-badge--auto">writing…</span>
            </button>
            <button type="button" className="summary-toggle-btn" disabled>
              <span className="toggle-avatar">A</span>
              Author&apos;s description
              <span className="toggle-badge toggle-badge--original">original</span>
            </button>
          </div>
        </div>

        <LoadingBar />

        <div className="skel-summary-body">
          {/* TL;DR card with typing cursor */}
          <div className="skel-tldr">
            <div className="skel-tldr-label">
              TL;DR
              <span className="skel-tldr-cursor" />
            </div>
            <span className="skel w-100" />
            <span className="skel w-90" />
            <span className="skel w-50" />
          </div>

          {/* Stats grid skeleton */}
          <div className="skel-stats">
            <div><span className="skel h-stat w-50" /><span className="skel h-eyebrow w-70" /></div>
            <div><span className="skel h-stat w-50" /><span className="skel h-eyebrow w-70" /></div>
            <div><span className="skel h-stat w-50" /><span className="skel h-eyebrow w-70" /></div>
            <div><span className="skel h-stat w-50" /><span className="skel h-eyebrow w-70" /></div>
          </div>

          {/* Prose sections, staggered */}
          <div className="skel-stagger">
            <section className="skel-section">
              <div className="skel-h"><span className="skel h-title w-40" /></div>
              <div className="skel-p">
                <span className="skel h-text w-100" />
                <span className="skel h-text w-90" />
                <span className="skel h-text w-70" />
              </div>
            </section>
            <section className="skel-section">
              <div className="skel-h"><span className="skel h-title w-50" /></div>
              <div className="skel-p">
                <span className="skel h-text w-100" />
                <span className="skel h-text w-80" />
              </div>
            </section>
            <section className="skel-section">
              <div className="skel-h"><span className="skel h-title w-30" /></div>
              <div className="skel-p">
                <span className="skel h-text w-100" />
                <span className="skel h-text w-100" />
                <span className="skel h-text w-60" />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Walkthrough loading (Stage 2 right panel) ──
// Pipeline chips + sequentially-appearing step skeletons.

export function WalkthroughLoadingState() {
  const slots = [
    { state: 'settled' as const, num: '1', titleW: 'w-60', descLines: 2, fileW: 'w-50' },
    { state: 'settled' as const, num: '2', titleW: 'w-50', descLines: 2, fileW: 'w-60' },
    { state: 'active' as const, num: null, titleW: 'w-70', descLines: 2, fileW: 'w-50' },
    { state: 'pending' as const, num: '4', titleW: 'w-40', descLines: 1, fileW: 'w-40' },
    { state: 'pending' as const, num: '5', titleW: 'w-50', descLines: 1, fileW: 'w-30' },
    { state: 'pending' as const, num: '6', titleW: 'w-30', descLines: 1, fileW: 'w-40' },
  ];

  return (
    <div className="wsl wsl-loading">
      <div className="wsl-header">
        <div className="wsl-stage-label">Stage 2 · Walkthrough</div>
        <div className="wsl-title">Reading path</div>
        <LoadingStatus label="Claude is planning your reading path…" sub="ordering by dependency" />
        <LoadingStageChips stages={[
          { state: 'done', label: 'Map dependencies' },
          { state: 'active', label: 'Rank by impact' },
          { state: 'pending', label: 'Write step notes' },
        ]} />
      </div>
      <LoadingBar />
      <div className="wsl-steps">
        <ol className="skel-walk-list">
          {slots.map((s, i) => (
            <li key={i} className={cn('skel-walk-item', s.state === 'active' && 'active', s.state === 'pending' && 'pending')}>
              <div className="skel-walk-num">
                {s.state === 'active' ? <span className="mini-spin" /> : s.num}
              </div>
              <div className="skel-walk-body">
                <span className={cn('skel h-title', s.titleW)} />
                {Array.from({ length: s.descLines }).map((_, j) => (
                  <span key={j} className={cn('skel h-text', j === s.descLines - 1 ? 'w-70' : 'w-100')} />
                ))}
                <span className={cn('skel h-line', s.fileW)} style={{ marginTop: 2, height: 9 }} />
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="skel-loading-foot">
        <span className="skel-loading-spinner" />
        <span className="skel-loading-meta">Sequencing files · est. 4s remaining</span>
      </div>
    </div>
  );
}

// ── Review loading (Stage 3 right panel) ──
// Severity-pass chips + cascading finding skeletons.

export function ReviewLoadingState() {
  const slots = [
    { sev: 'blocker', rank: '1', titleW: 'w-80' },
    { sev: 'warn', rank: '2', titleW: 'w-70' },
    { sev: 'warn', rank: '3', titleW: 'w-60' },
    { sev: 'nit', rank: '4', titleW: 'w-50' },
  ];

  return (
    <div className="findings-panel findings-loading">
      <div className="findings-panel-header">
        <div className="findings-stage-label">Stage 3 · Review</div>
        <div className="findings-title">Findings · ranked by severity</div>
        <LoadingStatus label="Claude is reviewing the code…" sub="scanning for issues" />
        <LoadingStageChips stages={[
          { state: 'done', label: 'Correctness' },
          { state: 'done', label: 'Security' },
          { state: 'active', label: 'Edge cases' },
          { state: 'pending', label: 'Style & nits' },
        ]} />
      </div>
      <LoadingBar />
      <div className="findings-panel-body">
        <ol className="skel-find-list">
          {slots.map((s, i) => (
            <li key={i} className={cn('skel-find-item', `skel-sev-${s.sev}`)}>
              <div className="skel-find-rank">{s.rank}</div>
              <div className="skel-find-body">
                <div className="skel-find-tagrow">
                  <span className={cn('skel-find-tag', s.sev)}>
                    {s.sev === 'blocker' ? 'Blocker' : s.sev === 'warn' ? 'Warning' : 'Nit'}
                  </span>
                  <span className="skel h-eyebrow w-30" />
                </div>
                <span className={cn('skel h-title', s.titleW)} />
                <span className="skel h-text w-100" />
                <span className="skel h-text w-80" />
                <span className="skel h-line w-50" style={{ height: 9, marginTop: 2 }} />
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="skel-loading-foot">
        <span className="skel-loading-spinner" />
        <span className="skel-loading-meta">2 findings drafted · scanning for more</span>
      </div>
    </div>
  );
}
