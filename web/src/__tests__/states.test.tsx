import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { AppState, DiffModel } from '@shared/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Mock DiffView so Task 1's tests don't depend on Task 2's implementation
vi.mock('../components/DiffView', () => ({
  DiffView: ({ model }: { model: DiffModel }) =>
    <div data-testid="diff-view-stub">{model.files.length} file(s)</div>,
}));

// Deferred import so the mock is registered before the module loads
const { DiffCanvas } = await import('../components/DiffCanvas');

// ─── Fixtures ────────────────────────────────────────────────────────────────
const loadingState: AppState = {
  phase: 'loading',
  session: { active: false },
  launchUrl: '',
  tokenLast4: '',
};

const emptyState: AppState = {
  phase: 'empty',
  session: { active: true },
  launchUrl: 'http://127.0.0.1:8080/',
  tokenLast4: 'zzzz',
};

const errorUnreachableState: AppState = {
  phase: 'error',
  errorVariant: 'unreachable',
  session: { active: false },
  launchUrl: '',
  tokenLast4: '',
};

const errorFetchFailedState: AppState = {
  phase: 'error',
  errorVariant: 'fetch-failed',
  session: { active: false },
  launchUrl: '',
  tokenLast4: '',
};

const diffState: AppState = {
  phase: 'diff',
  session: { active: true },
  diff: {
    files: [{ id: 'abc', path: 'a.ts', status: 'modified', binary: false, hunks: [] }],
    totalHunks: 0,
  },
  shikiTokens: { abc: [] },
  launchUrl: 'http://127.0.0.1:8080/',
  tokenLast4: 'zzzz',
};

// ─── Loading State Tests ──────────────────────────────────────────────────────
describe('DiffCanvas loading state', () => {
  it('renders the skeleton bar (data-testid skeleton-bar)', () => {
    const { getByTestId } = render(<DiffCanvas state={loadingState} />);
    expect(getByTestId('skeleton-bar')).toBeDefined();
  });

  it('skeleton bar has no visible text content', () => {
    const { getByTestId } = render(<DiffCanvas state={loadingState} />);
    const bar = getByTestId('skeleton-bar');
    expect(bar.textContent?.trim()).toBe('');
  });
});

// ─── Empty State Tests ────────────────────────────────────────────────────────
describe('DiffCanvas empty state', () => {
  it('renders heading "No changes" (verbatim UI-SPEC)', () => {
    render(<DiffCanvas state={emptyState} />);
    expect(screen.getByText('No changes')).toBeDefined();
  });

  it('renders body copy verbatim (UI-SPEC Copywriting Contract)', () => {
    render(<DiffCanvas state={emptyState} />);
    // The body text is split across nodes due to <code> element, check partial match
    expect(screen.getByText(/This diff has no changed files/)).toBeDefined();
  });

  it('renders the GitCompareArrows icon (data-testid diff-icon)', () => {
    const { getByTestId } = render(<DiffCanvas state={emptyState} />);
    expect(getByTestId('diff-icon')).toBeDefined();
  });
});

// ─── Error State Tests ────────────────────────────────────────────────────────
describe('DiffCanvas error state (unreachable)', () => {
  it('renders heading "Review unavailable" (verbatim UI-SPEC)', () => {
    render(<DiffCanvas state={errorUnreachableState} />);
    expect(screen.getByText('Review unavailable')).toBeDefined();
  });

  it('renders body copy mentioning "not responding"', () => {
    render(<DiffCanvas state={errorUnreachableState} />);
    expect(screen.getByText(/not responding/)).toBeDefined();
  });

  it('has NO <button> element (no retry button per UI-SPEC §<ErrorState>)', () => {
    const { container } = render(<DiffCanvas state={errorUnreachableState} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });
});

describe('DiffCanvas error state (fetch-failed)', () => {
  it('renders heading "Couldn\'t load diff" (verbatim UI-SPEC)', () => {
    render(<DiffCanvas state={errorFetchFailedState} />);
    expect(screen.getByText("Couldn't load diff")).toBeDefined();
  });

  it('renders body copy mentioning "couldn\'t be fetched"', () => {
    render(<DiffCanvas state={errorFetchFailedState} />);
    expect(screen.getByText(/couldn't be fetched/i)).toBeDefined();
  });

  it('has NO <button> element (no retry button per UI-SPEC §<ErrorState>)', () => {
    const { container } = render(<DiffCanvas state={errorFetchFailedState} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });
});

// ─── Diff Phase Tests ─────────────────────────────────────────────────────────
describe("DiffCanvas 'diff' phase", () => {
  it('renders DiffView stub with correct file count', () => {
    const { getByTestId } = render(<DiffCanvas state={diffState} />);
    expect(getByTestId('diff-view-stub').textContent).toContain('1 file');
  });
});
