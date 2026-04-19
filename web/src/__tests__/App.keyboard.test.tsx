// App.tsx keyboard behavior test suite (Plan 03-05 Task 1).
// Covers PLUG-04 keyboard shortcuts per D-17 / D-18 / UI-SPEC keyboard table.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import type { SnapshotMessage } from '@shared/types';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    postSessionEvent: vi.fn().mockResolvedValue({ ok: true }),
  };
});

import App from '../App';
import { actions, __resetForTesting } from '../store';
import { postSessionEvent, setReviewToken } from '../api';

// 3-file fixture:
//   fA: 2 hunks (non-generated) → 2 hunks in virtual list
//   fLock: 1 hunk (generated=true) → skipped by n/p
//   fB: 2 hunks (non-generated) → 2 hunks in virtual list
// Total non-generated hunks: 4 — virtualList indexes 0..3.
function makeSnapshotMsg(
  fileReviewStatus: Record<string, 'untouched' | 'in-progress' | 'reviewed'> = {}
): SnapshotMessage {
  return {
    type: 'snapshot',
    launchUrl: '',
    tokenLast4: '',
    session: {
      prKey: 'gh:o/r#1',
      pr: {
        source: 'github',
        title: 't',
        description: '',
        author: 'a',
        baseBranch: 'main',
        headBranch: 'feat',
        baseSha: 'b',
        headSha: 'h',
        additions: 0,
        deletions: 0,
        filesChanged: 3,
        number: 1,
        owner: 'o',
        repo: 'r',
      },
      diff: {
        totalHunks: 5,
        files: [
          {
            id: 'fA',
            path: 'a.ts',
            status: 'modified',
            binary: false,
            generated: false,
            hunks: [
              {
                id: 'fA:h0',
                header: '@@ -1 +1 @@',
                lines: [
                  {
                    id: 'fA:h0:l0',
                    kind: 'add',
                    side: 'RIGHT',
                    fileLine: 1,
                    diffPosition: 1,
                    text: 'x',
                  },
                ],
              },
              {
                id: 'fA:h1',
                header: '@@ -5 +5 @@',
                lines: [
                  {
                    id: 'fA:h1:l0',
                    kind: 'add',
                    side: 'RIGHT',
                    fileLine: 5,
                    diffPosition: 2,
                    text: 'y',
                  },
                ],
              },
            ],
          },
          {
            id: 'fLock',
            path: 'package-lock.json',
            status: 'modified',
            binary: false,
            generated: true,
            hunks: [
              {
                id: 'fLock:h0',
                header: '@@ -1 +1 @@',
                lines: [
                  {
                    id: 'fLock:h0:l0',
                    kind: 'add',
                    side: 'RIGHT',
                    fileLine: 1,
                    diffPosition: 3,
                    text: 'lock',
                  },
                ],
              },
            ],
          },
          {
            id: 'fB',
            path: 'b.ts',
            status: 'modified',
            binary: false,
            generated: false,
            hunks: [
              {
                id: 'fB:h0',
                header: '@@ -1 +1 @@',
                lines: [
                  {
                    id: 'fB:h0:l0',
                    kind: 'add',
                    side: 'RIGHT',
                    fileLine: 1,
                    diffPosition: 4,
                    text: 'q',
                  },
                ],
              },
              {
                id: 'fB:h1',
                header: '@@ -10 +10 @@',
                lines: [
                  {
                    id: 'fB:h1:l0',
                    kind: 'add',
                    side: 'RIGHT',
                    fileLine: 10,
                    diffPosition: 5,
                    text: 'r',
                  },
                ],
              },
            ],
          },
        ],
      },
      shikiTokens: {},
      createdAt: '',
      headSha: 'h',
      error: null,
      lastEventId: 0,
      fileReviewStatus,
    },
  };
}

function hydrateStore(
  fileReviewStatus: Record<string, 'untouched' | 'in-progress' | 'reviewed'> = {}
) {
  actions.onSnapshot(makeSnapshotMsg(fileReviewStatus));
}

function keyDown(key: string, opts: Partial<KeyboardEventInit> = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
  });
}

beforeEach(() => {
  __resetForTesting();
  setReviewToken('TOK');
  hydrateStore();
  vi.mocked(postSessionEvent).mockClear();
  vi.mocked(postSessionEvent).mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('App keyboard shortcuts (PLUG-04)', () => {
  it('n press advances focused hunk without POSTing (navigation only)', () => {
    render(<App />);
    keyDown('n');
    // n is navigation only — no POST should fire
    expect(vi.mocked(postSessionEvent)).not.toHaveBeenCalled();
  });

  it('n skips generated-file hunks; wraps after 4 presses with toast', () => {
    render(<App />);
    // virtualList has 4 non-generated hunks (fA:h0, fA:h1, fB:h0, fB:h1)
    // presses: 1→idx0, 2→idx1, 3→idx2, 4→idx3, 5→wrap to 0
    keyDown('n'); // idx 0 (fA:h0)
    keyDown('n'); // idx 1 (fA:h1)
    keyDown('n'); // idx 2 (fB:h0)
    keyDown('n'); // idx 3 (fB:h1)
    keyDown('n'); // wrap to idx 0
    const toast = screen.queryByRole('status');
    expect(toast?.textContent ?? '').toMatch(/wrapped to first hunk/i);
  });

  it('p from initial state wraps to last hunk with toast', () => {
    render(<App />);
    keyDown('p');
    const toast = screen.queryByRole('status');
    expect(toast?.textContent ?? '').toMatch(/wrapped to last hunk/i);
  });

  it('r toggles untouched→reviewed via postSessionEvent', async () => {
    render(<App />);
    keyDown('n'); // focus fA:h0 → focusedFileId = 'fA'
    keyDown('r');
    await act(async () => {});
    expect(postSessionEvent).toHaveBeenCalledWith(
      'gh:o/r#1',
      expect.objectContaining({
        type: 'file.reviewStatusSet',
        fileId: 'fA',
        status: 'reviewed',
      })
    );
  });

  it('r toggles reviewed→in-progress', async () => {
    hydrateStore({ fA: 'reviewed' });
    render(<App />);
    keyDown('n'); // focus fA:h0
    keyDown('r');
    await act(async () => {});
    expect(postSessionEvent).toHaveBeenCalledWith(
      'gh:o/r#1',
      expect.objectContaining({
        type: 'file.reviewStatusSet',
        fileId: 'fA',
        status: 'in-progress',
      })
    );
  });

  it('c/v/s render toasts; no postSessionEvent', () => {
    render(<App />);
    keyDown('c');
    expect(screen.queryByRole('status')?.textContent ?? '').toMatch(/phase 5/i);

    keyDown('v');
    expect(screen.queryByRole('status')?.textContent ?? '').toMatch(/phase 6/i);

    keyDown('s');
    expect(screen.queryByRole('status')?.textContent ?? '').toMatch(/phase 6/i);

    expect(postSessionEvent).not.toHaveBeenCalled();
  });

  it('ignores keydown when activeElement is INPUT (T-3-09)', () => {
    const { container } = render(<App />);
    const input = container.querySelector('input');
    // FileExplorer renders an <input placeholder="Filter changed files…">
    expect(input).toBeTruthy();
    input!.focus();
    expect(document.activeElement).toBe(input);
    keyDown('n');
    keyDown('r');
    expect(postSessionEvent).not.toHaveBeenCalled();
  });

  it('ignores modifier-key combos (cmd/ctrl/alt)', () => {
    render(<App />);
    keyDown('n', { metaKey: true });
    keyDown('n', { ctrlKey: true });
    keyDown('n', { altKey: true });
    keyDown('r', { metaKey: true });
    keyDown('r', { ctrlKey: true });
    keyDown('r', { altKey: true });
    expect(postSessionEvent).not.toHaveBeenCalled();
    // No toast either since modifier combos short-circuit before showToast
    expect(screen.queryByRole('status')).toBeNull();
  });
});
