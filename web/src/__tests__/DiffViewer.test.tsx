import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DiffViewer } from '../components/DiffViewer';
import diffModelFixture from './fixtures/diff-model.fixture.json';
import shikiTokensFixture from './fixtures/shiki-tokens.fixture.json';
import type { DiffModel, ShikiFileTokens, ReadOnlyComment, Walkthrough } from '@shared/types';

// Phase 3 Plan 03-03 — DiffViewer render test suite
// Validates Open Decision 1 (bespoke renderer). The split-mode DOM assertion catches
// regressions where SplitHunk silently falls through to unified rendering.

afterEach(() => {
  cleanup();
});

const noop = () => {};

function baseProps() {
  return {
    diff: diffModelFixture as unknown as DiffModel,
    shikiTokens: shikiTokensFixture as unknown as Record<string, ShikiFileTokens>,
    view: 'unified' as const,
    onViewChange: noop,
    fileReviewStatus: {} as Record<string, 'untouched' | 'in-progress' | 'reviewed'>,
    expandedGenerated: new Set<string>(),
    focusedHunkId: null as string | null,
    readOnlyComments: [] as ReadOnlyComment[],
    onMarkReviewed: noop,
    onExpandGenerated: noop,
  };
}

describe('DiffViewer (Phase 3 — Open Decision 1 validation)', () => {
  it('smoke-renders the fixture without throwing', () => {
    const { container } = render(<DiffViewer {...baseProps()} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('attaches a DOM anchor for every non-generated file (id="diff-${file.id}")', () => {
    const props = baseProps();
    const { container } = render(<DiffViewer {...props} />);
    for (const file of props.diff.files) {
      const el = container.querySelector(`#diff-${file.id}`);
      expect(el, `missing file anchor for ${file.path}`).toBeTruthy();
    }
  });

  it('attaches a DOM anchor for every hunk in non-generated files (id="${hunk.id}")', () => {
    const props = baseProps();
    const { container } = render(<DiffViewer {...props} />);
    for (const file of props.diff.files) {
      if (file.generated) continue;
      for (const hunk of file.hunks) {
        // Use attribute selector — hunk.id contains ':' which CSS id selectors treat as pseudo-class
        const el = container.querySelector(`[id="${hunk.id}"]`);
        expect(el, `missing hunk anchor for ${hunk.id}`).toBeTruthy();
      }
    }
  });

  it('first paint within 600ms on the committed fixture (D-09: 500ms target + 20% tolerance)', () => {
    const start = performance.now();
    const { container } = render(<DiffViewer {...baseProps()} />);
    const elapsed = performance.now() - start;
    expect(container.querySelector('.hunk'), 'at least one hunk element rendered').toBeTruthy();
    expect(elapsed).toBeLessThan(600);
  });

  it('collapses generated files by default and shows an Expand button', () => {
    const props = baseProps();
    const generatedFile = props.diff.files.find((f) => f.generated);
    expect(generatedFile, 'fixture must have a generated file').toBeTruthy();
    render(<DiffViewer {...props} />);
    const expandBtn = screen.getByRole('button', { name: /expand/i });
    expect(expandBtn).toBeTruthy();
  });

  it('calls onExpandGenerated(fileId, true) when the Expand button is clicked', () => {
    const props = baseProps();
    const generatedFile = props.diff.files.find((f) => f.generated);
    expect(generatedFile).toBeTruthy();
    const onExpand = vi.fn();
    render(<DiffViewer {...props} onExpandGenerated={onExpand} />);
    fireEvent.click(screen.getByRole('button', { name: /expand/i }));
    expect(onExpand).toHaveBeenCalledWith(generatedFile!.id, true);
  });

  it('renders a thread-marker for each ReadOnlyComment with a resolvable lineId', () => {
    const props = baseProps();
    const firstFile = props.diff.files.find(
      (f) => !f.generated && f.hunks.length > 0 && f.hunks[0].lines.length > 0,
    );
    expect(firstFile).toBeTruthy();
    const firstLine = firstFile!.hunks[0].lines[0];
    const roComment: ReadOnlyComment = {
      id: 1,
      lineId: firstLine.id,
      path: firstFile!.path,
      line: firstLine.fileLine,
      side: firstLine.side,
      author: 'alice',
      createdAt: '2026-04-01T00:00:00Z',
      body: 'lgtm',
      htmlUrl: 'https://example.test/1',
    };
    const { container } = render(<DiffViewer {...props} readOnlyComments={[roComment]} />);
    const markers = container.querySelectorAll('.thread-marker');
    expect(markers.length).toBeGreaterThan(0);
  });

  it('T-3-01: Shiki token with "<script>" content is rendered as literal text, never executed', () => {
    const diff: DiffModel = {
      totalHunks: 1,
      files: [
        {
          id: 'xyz',
          path: 'evil.ts',
          status: 'modified',
          binary: false,
          generated: false,
          hunks: [
            {
              id: 'xyz:h0',
              header: '@@ -1 +1 @@',
              lines: [
                {
                  id: 'xyz:h0:l0',
                  kind: 'add',
                  side: 'RIGHT',
                  fileLine: 1,
                  diffPosition: 1,
                  text: '<script>BAD</script>',
                },
              ],
            },
          ],
        },
      ],
    };
    const shikiTokens: Record<string, ShikiFileTokens> = {
      xyz: [[[{ content: '<script>BAD</script>', color: '#000000' }]]],
    };
    const { container } = render(
      <DiffViewer {...baseProps()} diff={diff} shikiTokens={shikiTokens} />,
    );
    // No <script> element should be in the DOM
    expect(container.querySelectorAll('script')).toHaveLength(0);
    // The literal text should be present
    expect(container.textContent).toContain('<script>BAD</script>');
  });

  it('T-3-03: ReadOnlyComment.body is rendered as React text node, never as HTML', () => {
    const props = baseProps();
    const firstFile = props.diff.files.find(
      (f) => !f.generated && f.hunks.length > 0 && f.hunks[0].lines.length > 0,
    );
    expect(firstFile).toBeTruthy();
    const firstLine = firstFile!.hunks[0].lines[0];
    const evilComment: ReadOnlyComment = {
      id: 1,
      lineId: firstLine.id,
      path: firstFile!.path,
      line: firstLine.fileLine,
      side: firstLine.side,
      author: 'evil',
      createdAt: '2026-04-01T00:00:00Z',
      body: '<img src=x onerror="(window as any).__BAD=1">',
      htmlUrl: 'https://example.test/1',
    };
    const { container } = render(<DiffViewer {...props} readOnlyComments={[evilComment]} />);
    // Open the popover by clicking the marker (if marker render requires a click to show body)
    const marker = container.querySelector('.thread-marker') as HTMLElement | null;
    if (marker) {
      fireEvent.click(marker);
    }
    // No <img> element matching the attacker payload should be in the DOM
    const images = container.querySelectorAll('img[src="x"]');
    expect(images).toHaveLength(0);
    // And __BAD must not be set by the popover
    expect((window as unknown as { __BAD?: unknown }).__BAD).toBeUndefined();
  });

  it('split mode — renders a distinguishable DOM signal and DIFFERENT cell count than unified', () => {
    const props = baseProps();

    // Render unified first to capture the baseline <td> count on the same fixture
    const unifiedRender = render(<DiffViewer {...props} view="unified" />);
    const unifiedTdCount = unifiedRender.container.querySelectorAll('td').length;
    cleanup();

    // Now render split mode
    const splitRender = render(<DiffViewer {...props} view="split" />);
    const container = splitRender.container;

    // INV-1: container.firstChild exists (split render did not throw)
    expect(container.firstChild).toBeTruthy();

    // INV-2: At least one of the split DOM signals is present.
    const dataViewSignal = container.querySelector('[data-view="split"]');
    const rowSignal = container.querySelectorAll('.diff-row-split').length;
    const tableSignal = container.querySelectorAll('.diff-table.split tbody tr').length;
    const anySignal = Boolean(dataViewSignal) || rowSignal > 0 || tableSignal > 0;
    expect(
      anySignal,
      'split mode must emit data-view="split" OR .diff-row-split rows OR .diff-table.split tbody — Task 2 implementation MUST choose ONE',
    ).toBe(true);

    // INV-3: split mode has a different <td> count than unified on the same fixture.
    const splitTdCount = container.querySelectorAll('td').length;
    expect(
      splitTdCount,
      'split mode should produce a different <td> count than unified on the same fixture',
    ).not.toBe(unifiedTdCount);
  });

  it('unified mode — absence of split DOM signals', () => {
    const { container } = render(<DiffViewer {...baseProps()} view="unified" />);
    expect(container.querySelector('[data-view="split"]')).toBeNull();
    expect(container.querySelectorAll('.diff-row-split').length).toBe(0);
    expect(container.querySelectorAll('.diff-table.split tbody tr').length).toBe(0);
  });

  it('handles empty diff gracefully', () => {
    const emptyDiff: DiffModel = { files: [], totalHunks: 0 };
    const { container } = render(
      <DiffViewer {...baseProps()} diff={emptyDiff} shikiTokens={{}} />,
    );
    expect(container.firstChild).toBeTruthy();
  });
});

describe('DiffViewer walkthrough hunk filtering (Gap 1 closure)', () => {
  // The fixture non-generated files and their hunk IDs:
  //   216381173f18 (src/app.ts)    h0..h7  (8 hunks)
  //   d49e08f18c89 (src/utils.ts)  h0..h3  (4 hunks)
  //   8ec9a00bfd09 (README.md)     h0      (1 hunk)
  //   62c9fedb1aea (src/api.ts)    h0..h6  (7 hunks)
  //   e3357f6213a8 (config/...)    h0..h5  (6 hunks)
  // The generated file fa288d1472d2 (package-lock.json) is excluded from curated view.

  it('in curated mode, only renders hunks present in walkthrough.steps', () => {
    const fullDiff = diffModelFixture as unknown as DiffModel;
    // Curate only the first hunk of src/app.ts
    const curatedHunkId = '216381173f18:h0';
    const walkthrough: Walkthrough = {
      steps: [{ stepNum: 1, hunkId: curatedHunkId, commentary: 'First hunk', status: 'pending' }],
      cursor: 0,
      showAll: false,
    };

    // Reproduce the App.tsx filteredDiff memo logic to build the filtered DiffModel
    const curatedHunkIds = new Set(walkthrough.steps.map(s => s.hunkId));
    const filteredFiles = fullDiff.files
      .filter(f => !f.generated)
      .map(f => ({ ...f, hunks: f.hunks.filter(h => curatedHunkIds.has(h.id)) }))
      .filter(f => f.hunks.length > 0);
    const filteredDiff: DiffModel = {
      files: filteredFiles,
      totalHunks: filteredFiles.reduce((n, f) => n + f.hunks.length, 0),
    };

    const { container } = render(
      <DiffViewer
        {...baseProps()}
        diff={filteredDiff}
        walkthrough={walkthrough}
      />,
    );

    // The curated hunk must be present
    const curatedEl = container.querySelector(`[id="${curatedHunkId}"]`);
    expect(curatedEl, 'curated hunk anchor must be present').toBeTruthy();

    // Non-curated hunks must NOT be present
    const nonCuratedHunkId = '216381173f18:h1';
    const nonCuratedEl = container.querySelector(`[id="${nonCuratedHunkId}"]`);
    expect(nonCuratedEl, 'non-curated hunk anchor must be absent in curated mode').toBeNull();

    // Only 1 hunk element in the entire rendered output
    const allHunks = container.querySelectorAll('.hunk');
    expect(allHunks.length).toBe(1);
  });

  it('in show-all mode, renders all non-generated hunks and curated hunks have hunk--curated class', () => {
    const fullDiff = diffModelFixture as unknown as DiffModel;
    // Curate only h0 from src/app.ts, but showAll=true so everything renders
    const curatedHunkId = '216381173f18:h0';
    const walkthrough: Walkthrough = {
      steps: [{ stepNum: 1, hunkId: curatedHunkId, commentary: 'First hunk', status: 'pending' }],
      cursor: 0,
      showAll: true,
    };

    const { container } = render(
      <DiffViewer
        {...baseProps()}
        diff={fullDiff}
        walkthrough={walkthrough}
      />,
    );

    // All non-generated file hunk anchors must be present
    for (const file of fullDiff.files) {
      if (file.generated) continue;
      for (const hunk of file.hunks) {
        const el = container.querySelector(`[id="${hunk.id}"]`);
        expect(el, `hunk anchor ${hunk.id} must be present in show-all mode`).toBeTruthy();
      }
    }

    // The curated hunk must have the hunk--curated CSS class
    const curatedEl = container.querySelector(`[id="${curatedHunkId}"]`);
    expect(curatedEl, 'curated hunk element must exist').toBeTruthy();
    expect(
      curatedEl!.classList.contains('hunk--curated'),
      'curated hunk must have hunk--curated class in show-all mode',
    ).toBe(true);

    // Non-curated hunks must NOT have hunk--curated class
    const nonCuratedEl = container.querySelector('[id="216381173f18:h1"]');
    expect(nonCuratedEl, 'non-curated hunk must exist in show-all mode').toBeTruthy();
    expect(
      nonCuratedEl!.classList.contains('hunk--curated'),
      'non-curated hunk must NOT have hunk--curated class',
    ).toBe(false);
  });
});
