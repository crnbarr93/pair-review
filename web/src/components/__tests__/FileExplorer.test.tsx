import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { FileExplorer } from '../FileExplorer';
import type { DiffFile } from '@shared/types';

afterEach(() => {
  cleanup();
});

function makeFile(
  id: string,
  path: string,
  generated: boolean = false
): DiffFile {
  return {
    id,
    path,
    status: 'modified',
    binary: false,
    generated,
    hunks: [],
  };
}

describe('FileExplorer (Phase 3 live-wired)', () => {
  it('renders one row per file from props', () => {
    const files = [makeFile('f1', 'src/a.ts'), makeFile('f2', 'src/b.ts')];
    const { container } = render(
      <FileExplorer
        files={files}
        fileReviewStatus={{}}
        activeFileId={null}
        onPickFile={() => {}}
      />
    );
    expect(container.textContent).toContain('a.ts');
    expect(container.textContent).toContain('b.ts');
  });

  it('uses var(--ok) for reviewed dot, var(--warn) for in-progress, var(--ink-4) for untouched', () => {
    const files = [
      makeFile('fA', 'a.ts'),
      makeFile('fB', 'b.ts'),
      makeFile('fC', 'c.ts'),
    ];
    const { container } = render(
      <FileExplorer
        files={files}
        fileReviewStatus={{
          fA: 'reviewed',
          fB: 'in-progress',
          fC: 'untouched',
        }}
        activeFileId={null}
        onPickFile={() => {}}
      />
    );
    const html = container.innerHTML;
    expect(html).toMatch(/var\(--ok\)/);
    expect(html).toMatch(/var\(--warn\)/);
    expect(html).toMatch(/var\(--ink-4\)/);
  });

  it('renders generated files with Excluded label', () => {
    const files = [makeFile('fA', 'package-lock.json', true)];
    const { container } = render(
      <FileExplorer
        files={files}
        fileReviewStatus={{}}
        activeFileId={null}
        onPickFile={() => {}}
      />
    );
    expect(container.textContent).toContain('Excluded');
  });

  it('Repo tab is rendered disabled with Phase 7 tooltip', () => {
    const { container } = render(
      <FileExplorer
        files={[]}
        fileReviewStatus={{}}
        activeFileId={null}
        onPickFile={() => {}}
      />
    );
    const repoTab = Array.from(container.querySelectorAll('button')).find((b) =>
      /^repo$/i.test((b.textContent ?? '').trim())
    );
    expect(repoTab).toBeTruthy();
    expect(repoTab).toBeDisabled();
    expect(repoTab?.getAttribute('title')).toMatch(/phase 7/i);
  });

  it('calls onPickFile and scrollIntoView when a file row is clicked', () => {
    const onPick = vi.fn();
    const files = [makeFile('f1', 'a.ts')];
    const scrollSpy = vi.fn();
    const anchor = document.createElement('div');
    anchor.id = 'diff-f1';
    anchor.scrollIntoView = scrollSpy;
    document.body.appendChild(anchor);

    const { container } = render(
      <FileExplorer
        files={files}
        fileReviewStatus={{}}
        activeFileId={null}
        onPickFile={onPick}
      />
    );
    const row = container.querySelector(
      '[data-file-id="f1"]'
    ) as HTMLElement | null;
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    expect(onPick).toHaveBeenCalledWith('f1');
    expect(scrollSpy).toHaveBeenCalled();
    document.body.removeChild(anchor);
  });

  it('summary chips show correct live counts', () => {
    const files = [
      makeFile('fA', 'a.ts'),
      makeFile('fB', 'b.ts'),
      makeFile('fC', 'c.ts'),
      makeFile('fD', 'd.ts'),
    ];
    const { container } = render(
      <FileExplorer
        files={files}
        fileReviewStatus={{
          fA: 'reviewed',
          fB: 'reviewed',
          fC: 'in-progress',
        }}
        activeFileId={null}
        onPickFile={() => {}}
      />
    );
    expect(container.textContent).toMatch(/2 reviewed/);
    expect(container.textContent).toMatch(/1 in-progress/);
    expect(container.textContent).toMatch(/1 untouched/);
  });

  it('applies active class to activeFileId file', () => {
    const files = [makeFile('f1', 'a.ts'), makeFile('f2', 'b.ts')];
    const { container } = render(
      <FileExplorer
        files={files}
        fileReviewStatus={{}}
        activeFileId="f2"
        onPickFile={() => {}}
      />
    );
    const active = container.querySelector('[data-file-id="f2"]');
    expect(active?.className).toMatch(/active/);
    const inactive = container.querySelector('[data-file-id="f1"]');
    expect(inactive?.className ?? '').not.toMatch(/active/);
  });
});
