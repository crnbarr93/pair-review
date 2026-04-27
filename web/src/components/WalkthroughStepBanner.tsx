/**
 * WalkthroughStepBanner — step info banner that renders above the diff in Walkthrough mode.
 * Implements D-01 (step info header) and D-02 (prev/next navigation cards).
 *
 * CSS class names expected (to be defined in index.css, Plan 04):
 *   wt-banner               — outer container (var(--paper-2) bg, border-bottom, 12px 20px padding)
 *   wt-banner-meta          — top line "STEP N OF M · K/N reviewed" (monospace, small caps, 11px)
 *   wt-banner-title         — first sentence of commentary (14px semi-bold)
 *   wt-banner-desc          — remainder of commentary (13px, var(--ink-2))
 *   wt-banner-reviewed      — "Reviewed" badge shown when step status is 'visited' (var(--ok))
 *   wt-banner-nav           — row holding PREV and NEXT nav cards
 *   wt-banner-nav-card      — individual nav card (subtle border, small font, arrow indicator)
 *   wt-banner-nav-card--prev — modifier for prev card (arrow on left)
 *   wt-banner-nav-card--next — modifier for next card (arrow on right)
 *   wt-banner-nav-card--disabled — modifier when card is inactive (no adjacent step)
 *   wt-banner-nav-label     — PREV / NEXT label inside nav card
 *   wt-banner-nav-title     — adjacent step title inside nav card
 */
import type { Walkthrough } from '@shared/types';

interface WalkthroughStepBannerProps {
  walkthrough: Walkthrough;
  onStepClick: (cursor: number) => void;
}

/** Split commentary into title (first sentence) and description (remainder). */
function splitCommentary(commentary: string): { title: string; desc: string } {
  const dotIndex = commentary.indexOf('.');
  if (dotIndex === -1 || dotIndex === commentary.length - 1) {
    return { title: commentary, desc: '' };
  }
  return {
    title: commentary.slice(0, dotIndex + 1).trim(),
    desc: commentary.slice(dotIndex + 1).trim(),
  };
}

/** Truncate a string for use inside a small nav card. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

export function WalkthroughStepBanner({ walkthrough, onStepClick }: WalkthroughStepBannerProps) {
  const { steps, cursor } = walkthrough;

  if (steps.length === 0) return null;

  const currentStep = steps[cursor];
  if (!currentStep) return null;

  const { title, desc } = splitCommentary(currentStep.commentary);

  const visitedCount = steps.filter(s => s.status === 'visited').length;
  const isReviewed = currentStep.status === 'visited';

  const hasPrev = cursor > 0;
  const hasNext = cursor < steps.length - 1;

  const prevStep = hasPrev ? steps[cursor - 1] : null;
  const nextStep = hasNext ? steps[cursor + 1] : null;

  return (
    <div className="wt-banner" role="region" aria-label={`Step ${cursor + 1} of ${steps.length}`}>
      {/* Top meta line: STEP N OF M · K/M reviewed */}
      <div className="wt-banner-meta">
        STEP {cursor + 1} OF {steps.length} &nbsp;&middot;&nbsp; {visitedCount}/{steps.length} reviewed
        {isReviewed && (
          <span className="wt-banner-reviewed" aria-label="Reviewed">
            {/* Checkmark icon */}
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2.5 6l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {' '}Reviewed
          </span>
        )}
      </div>

      {/* Step title: first sentence of commentary */}
      <div className="wt-banner-title">{title}</div>

      {/* Step description: remainder of commentary */}
      {desc && (
        <div className="wt-banner-desc">{desc}</div>
      )}

      {/* PREV / NEXT navigation cards */}
      <div className="wt-banner-nav">
        {/* PREV card */}
        <button
          type="button"
          className={`wt-banner-nav-card wt-banner-nav-card--prev${!hasPrev ? ' wt-banner-nav-card--disabled' : ''}`}
          onClick={() => hasPrev && onStepClick(cursor - 1)}
          disabled={!hasPrev}
          aria-label={hasPrev ? `Go to previous step: ${prevStep?.commentary.split('.')[0] ?? ''}` : 'No previous step'}
        >
          <span className="wt-banner-nav-arrow" aria-hidden="true">&#8592;</span>
          <span className="wt-banner-nav-label">PREV</span>
          {hasPrev && prevStep && (
            <span className="wt-banner-nav-title">
              {truncate(prevStep.commentary.split('.')[0] || prevStep.commentary, 50)}
            </span>
          )}
        </button>

        {/* NEXT card */}
        <button
          type="button"
          className={`wt-banner-nav-card wt-banner-nav-card--next${!hasNext ? ' wt-banner-nav-card--disabled' : ''}`}
          onClick={() => hasNext && onStepClick(cursor + 1)}
          disabled={!hasNext}
          aria-label={hasNext ? `Go to next step: ${nextStep?.commentary.split('.')[0] ?? ''}` : 'No next step'}
        >
          <span className="wt-banner-nav-label">NEXT</span>
          {hasNext && nextStep && (
            <span className="wt-banner-nav-title">
              {truncate(nextStep.commentary.split('.')[0] || nextStep.commentary, 50)}
            </span>
          )}
          <span className="wt-banner-nav-arrow" aria-hidden="true">&#8594;</span>
        </button>
      </div>
    </div>
  );
}
