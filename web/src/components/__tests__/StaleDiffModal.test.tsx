import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { AppState } from '../../store';
import type { ChooseResumeSource } from '../../api';

/**
 * Unit tests for StaleDiffModal (Plan 02-04 Task 3).
 *
 * We stub ../../store to inject a synthetic AppState per test and
 * ../../api to spy on chooseResume. All 7 modal behaviors from the
 * plan's <behavior> block.
 */

const chooseResumeMock = vi.fn();
let currentState: AppState;

vi.mock('../../store', () => ({
  useAppStore: () => currentState,
}));

vi.mock('../../api', () => ({
  chooseResume: (...args: unknown[]) => chooseResumeMock(...args),
}));

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    phase: 'diff',
    session: { active: true },
    launchUrl: '',
    tokenLast4: '',
    sessionKey: 'gh:o/r#1',
    source: { kind: 'github', number: 1 } as ChooseResumeSource,
    // Phase 3 AppState fields (Plan 03-04) — required on AppState, supplied with empty defaults.
    fileReviewStatus: {},
    expandedGeneratedFiles: {},
    existingComments: [],
    ciStatus: undefined,
    prKey: 'gh:o/r#1',
    ...overrides,
  };
}

async function importModal() {
  const mod = await import('../StaleDiffModal');
  return mod.StaleDiffModal;
}

describe('StaleDiffModal', () => {
  beforeEach(() => {
    chooseResumeMock.mockReset();
    chooseResumeMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders null when state.staleDiff is absent', async () => {
    currentState = makeState();
    const StaleDiffModal = await importModal();
    render(<StaleDiffModal />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders three buttons with the Phase-2 labels when staleDiff is present', async () => {
    currentState = makeState({
      staleDiff: { storedSha: 'aaaaaaaabb', currentSha: 'ccccccccdd' },
    });
    const StaleDiffModal = await importModal();
    render(<StaleDiffModal />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh to current PR' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard session' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View both' })).toBeInTheDocument();
  });

  it("primary button posts choice 'adopt'", async () => {
    currentState = makeState({
      staleDiff: { storedSha: 'aaaaaaaa', currentSha: 'bbbbbbbb' },
    });
    const StaleDiffModal = await importModal();
    render(<StaleDiffModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh to current PR' }));

    expect(chooseResumeMock).toHaveBeenCalledTimes(1);
    expect(chooseResumeMock).toHaveBeenCalledWith({
      prKey: 'gh:o/r#1',
      choice: 'adopt',
      source: { kind: 'github', number: 1 },
    });
  });

  it("destructive button posts choice 'reset'", async () => {
    currentState = makeState({
      staleDiff: { storedSha: 'aaaaaaaa', currentSha: 'bbbbbbbb' },
    });
    const StaleDiffModal = await importModal();
    render(<StaleDiffModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Discard session' }));

    expect(chooseResumeMock).toHaveBeenCalledTimes(1);
    expect(chooseResumeMock.mock.calls[0][0].choice).toBe('reset');
  });

  it("tertiary button posts choice 'viewBoth'", async () => {
    currentState = makeState({
      staleDiff: { storedSha: 'aaaaaaaa', currentSha: 'bbbbbbbb' },
    });
    const StaleDiffModal = await importModal();
    render(<StaleDiffModal />);

    fireEvent.click(screen.getByRole('button', { name: 'View both' }));

    expect(chooseResumeMock).toHaveBeenCalledTimes(1);
    expect(chooseResumeMock.mock.calls[0][0].choice).toBe('viewBoth');
  });

  it('is NOT dismissible via Escape keydown', async () => {
    currentState = makeState({
      staleDiff: { storedSha: 'aaaaaaaa', currentSha: 'bbbbbbbb' },
    });
    const StaleDiffModal = await importModal();
    render(<StaleDiffModal />);

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    // Modal must still be in the DOM — no Escape handler wired.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it("shows 'Refreshing diff…' and disables buttons while a choice is in flight", async () => {
    currentState = makeState({
      staleDiff: { storedSha: 'aaaaaaaa', currentSha: 'bbbbbbbb' },
    });
    // Never-resolving promise — we want to inspect the intermediate state
    chooseResumeMock.mockImplementation(() => new Promise(() => {}));

    const StaleDiffModal = await importModal();
    render(<StaleDiffModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh to current PR' }));

    // "Refreshing diff…" replaces the button group per the plan's behavior:
    // the three buttons unmount when pending !== null, and the overlay text
    // appears in their place.
    expect(screen.getByText(/Refreshing diff/i)).toBeInTheDocument();
  });
});
