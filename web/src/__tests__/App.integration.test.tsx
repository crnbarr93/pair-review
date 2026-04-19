// App.tsx integration test (Plan 03-05 Task 3).
// Covers final AppShell wiring: TopBar + FileExplorer + DiffViewer smoke,
// expand-generated POST, FileExplorer → scrollIntoView, StaleDiffModal mount.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
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

function makeSnapshotWithGenerated(): SnapshotMessage {
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
        additions: 1,
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
                    diffPosition: 1,
                    text: 'lock',
                  },
                ],
              },
            ],
          },
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
    },
  };
}

function makeStaleSnapshot(): SnapshotMessage {
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
        filesChanged: 1,
        number: 1,
        owner: 'o',
        repo: 'r',
      },
      diff: {
        totalHunks: 1,
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
      headSha: 'current',
      error: null,
      lastEventId: 0,
      staleDiff: { storedSha: 'stored', currentSha: 'current' },
    },
  };
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
});

describe('App integration — final wiring', () => {
  it('renders TopBar + FileExplorer + DiffViewer with live store data (smoke)', () => {
    actions.onSnapshot(makeSnapshotWithGenerated());
    const { container } = render(<App />);
    expect(container.textContent).toContain('PairReview'); // TopBar brand
    expect(container.textContent).toContain('a.ts'); // FileExplorer + DiffViewer path
    expect(container.textContent).toContain('Excluded'); // Generated-file marker
  });

  it('Expand on generated-file stub POSTs file.generatedExpandToggled with expanded=true', async () => {
    actions.onSnapshot(makeSnapshotWithGenerated());
    const { container } = render(<App />);
    const expandBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => /^expand$/i.test((b.textContent ?? '').trim())
    );
    expect(expandBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(expandBtn!);
    });
    expect(postSessionEvent).toHaveBeenCalledWith(
      'gh:o/r#1',
      expect.objectContaining({
        type: 'file.generatedExpandToggled',
        fileId: 'fLock',
        expanded: true,
      })
    );
  });

  it('clicking a FileExplorer row calls scrollIntoView on the correct diff anchor', () => {
    actions.onSnapshot(makeSnapshotWithGenerated());
    const { container } = render(<App />);
    const scrollSpy = vi.fn();
    const fAEl = container.querySelector('#diff-fA');
    expect(fAEl).toBeTruthy();
    (fAEl as HTMLElement & { scrollIntoView: typeof vi.fn }).scrollIntoView = scrollSpy;
    const aRow = container.querySelector(
      '.exp-file[data-file-id="fA"]'
    ) as HTMLElement | null;
    expect(aRow).toBeTruthy();
    fireEvent.click(aRow!);
    expect(scrollSpy).toHaveBeenCalled();
  });

  it('StaleDiffModal renders when state.staleDiff is set (Phase 2 regression check)', () => {
    actions.onSnapshot(makeStaleSnapshot());
    // Need to set source so StaleDiffModal renders the full dialog (not fail-safe)
    actions.setSource({
      kind: 'github',
      owner: 'o',
      repo: 'r',
      number: 1,
      url: 'https://github.com/o/r/pull/1',
    } as never);
    const { container } = render(<App />);
    expect(container.textContent).toMatch(/PR updated|Refresh|Discard|View both/i);
  });
});
