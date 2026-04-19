// App.tsx IntersectionObserver test suite (Plan 03-05 Task 2).
// Covers D-11: 50% threshold, 500ms debounce, early-exit cancels, status-gate.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
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

type Status = 'untouched' | 'in-progress' | 'reviewed';

function makeSnapshot(fileReviewStatus: Record<string, Status> = {}): SnapshotMessage {
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
        filesChanged: 2,
        number: 1,
        owner: 'o',
        repo: 'r',
      },
      diff: {
        totalHunks: 2,
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
                    diffPosition: 2,
                    text: 'y',
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

function hydrate(fileReviewStatus: Record<string, Status> = {}) {
  actions.onSnapshot(makeSnapshot(fileReviewStatus));
}

interface TrackedObserver {
  __trigger: (target: Element, isIntersecting: boolean) => void;
  __observed: () => Element[];
}

function lastObserver(): TrackedObserver {
  const fn = (globalThis as Record<string, unknown>).__lastIntersectionObserver as
    | (() => TrackedObserver)
    | undefined;
  if (!fn) throw new Error('MockIntersectionObserver not installed');
  const obs = fn();
  if (!obs) throw new Error('No IntersectionObserver constructed');
  return obs;
}

beforeEach(() => {
  __resetForTesting();
  setReviewToken('TOK');
  vi.mocked(postSessionEvent).mockClear();
  vi.mocked(postSessionEvent).mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('App IntersectionObserver auto-in-progress (D-11)', () => {
  it('POSTs in-progress after 500ms of intersecting on an untouched file', async () => {
    vi.useFakeTimers();
    hydrate();
    render(<App />);
    const observer = lastObserver();
    expect(observer).toBeTruthy();

    const fileAEl = document.getElementById('diff-fA');
    expect(fileAEl).toBeTruthy();

    act(() => {
      observer.__trigger(fileAEl!, true);
    });
    expect(postSessionEvent).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });
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

  it('does NOT fire if file exits viewport before 500ms', async () => {
    vi.useFakeTimers();
    hydrate();
    render(<App />);
    const observer = lastObserver();
    const fileAEl = document.getElementById('diff-fA');
    expect(fileAEl).toBeTruthy();

    act(() => {
      observer.__trigger(fileAEl!, true);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      observer.__trigger(fileAEl!, false);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    await act(async () => {});
    expect(postSessionEvent).not.toHaveBeenCalled();
  });

  it('does NOT fire when current status is already reviewed', async () => {
    vi.useFakeTimers();
    hydrate({ fA: 'reviewed' });
    render(<App />);
    const observer = lastObserver();
    const fileAEl = document.getElementById('diff-fA');
    expect(fileAEl).toBeTruthy();

    act(() => {
      observer.__trigger(fileAEl!, true);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    await act(async () => {});
    expect(postSessionEvent).not.toHaveBeenCalled();
  });

  it('does NOT fire when current status is already in-progress', async () => {
    vi.useFakeTimers();
    hydrate({ fA: 'in-progress' });
    render(<App />);
    const observer = lastObserver();
    const fileAEl = document.getElementById('diff-fA');
    expect(fileAEl).toBeTruthy();

    act(() => {
      observer.__trigger(fileAEl!, true);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    await act(async () => {});
    expect(postSessionEvent).not.toHaveBeenCalled();
  });
});
