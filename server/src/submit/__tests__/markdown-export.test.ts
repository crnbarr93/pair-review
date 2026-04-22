import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { validateExportPath, exportReviewMarkdown } from '../markdown-export.js';
import type { Thread } from '@shared/types';

function makeTmpPath(): string {
  return path.join(os.tmpdir(), `review-test-${nanoid(8)}.md`);
}

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    threadId: 'thread-1',
    lineId: 'file1:h0:l0',
    path: 'src/foo.ts',
    line: 12,
    side: 'RIGHT',
    preExisting: false,
    turns: [],
    draftBody: 'Some inline comment.',
    resolved: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('validateExportPath', () => {
  it('throws for a relative path', () => {
    expect(() => validateExportPath('relative/path/review.md')).toThrow(
      'exportPath must be an absolute path'
    );
  });

  it('throws for a non-.md extension', () => {
    expect(() => validateExportPath('/tmp/review.txt')).toThrow(
      'exportPath must end with .md'
    );
  });

  it('throws for a path containing ".." segments', () => {
    expect(() => validateExportPath('/tmp/../etc/review.md')).toThrow(
      'exportPath must not contain ".." segments'
    );
  });

  it('passes for a valid absolute .md path', () => {
    expect(() => validateExportPath('/tmp/review.md')).not.toThrow();
  });

  it('passes for a deeply nested absolute .md path', () => {
    expect(() => validateExportPath('/home/user/reviews/pr-123/summary.md')).not.toThrow();
  });
});

describe('exportReviewMarkdown', () => {
  it('writes a file containing the verdict header', async () => {
    const exportPath = makeTmpPath();
    await exportReviewMarkdown({
      verdict: 'request_changes',
      body: 'Review body here.',
      threads: {},
      baseRef: 'main',
      headRef: 'feature/foo',
      title: 'My PR',
      exportPath,
    });
    const content = await fs.readFile(exportPath, 'utf-8');
    expect(content).toContain('**Verdict:** Request changes');
    expect(content).toContain('# Review: My PR');
  });

  it('writes the base->head refs', async () => {
    const exportPath = makeTmpPath();
    await exportReviewMarkdown({
      verdict: 'approve',
      body: 'LGTM',
      threads: {},
      baseRef: 'main',
      headRef: 'feature/bar',
      title: 'Test PR',
      exportPath,
    });
    const content = await fs.readFile(exportPath, 'utf-8');
    expect(content).toContain('main -> feature/bar');
  });

  it('writes inline comments with ### file:line (side) format', async () => {
    const exportPath = makeTmpPath();
    const threads: Record<string, Thread> = {
      t1: makeThread({
        threadId: 't1',
        path: 'src/auth.ts',
        line: 42,
        side: 'RIGHT',
        draftBody: 'Consider caching this call.',
        resolved: false,
      }),
    };
    await exportReviewMarkdown({
      verdict: 'comment',
      body: 'Review body.',
      threads,
      baseRef: 'main',
      headRef: 'feature/auth',
      title: 'Auth PR',
      exportPath,
    });
    const content = await fs.readFile(exportPath, 'utf-8');
    expect(content).toContain('### src/auth.ts:42 (RIGHT)');
    expect(content).toContain('Consider caching this call.');
    expect(content).toContain('## Inline Comments');
  });

  it('handles zero inline comments — no "Inline Comments" section header', async () => {
    const exportPath = makeTmpPath();
    await exportReviewMarkdown({
      verdict: 'approve',
      body: 'All good.',
      threads: {},
      baseRef: 'main',
      headRef: 'feature/empty',
      title: 'Empty PR',
      exportPath,
    });
    const content = await fs.readFile(exportPath, 'utf-8');
    expect(content).not.toContain('## Inline Comments');
  });

  it('skips resolved threads from the inline comments section', async () => {
    const exportPath = makeTmpPath();
    const threads: Record<string, Thread> = {
      t1: makeThread({ threadId: 't1', draftBody: 'Active comment', resolved: false }),
      t2: makeThread({ threadId: 't2', draftBody: 'Resolved comment', resolved: true }),
    };
    await exportReviewMarkdown({
      verdict: 'comment',
      body: 'body',
      threads,
      baseRef: 'main',
      headRef: 'feat',
      title: 'PR',
      exportPath,
    });
    const content = await fs.readFile(exportPath, 'utf-8');
    expect(content).toContain('Active comment');
    expect(content).not.toContain('Resolved comment');
  });

  it('rejects invalid paths (calls validateExportPath)', async () => {
    await expect(
      exportReviewMarkdown({
        verdict: 'approve',
        body: 'body',
        threads: {},
        baseRef: 'main',
        headRef: 'feat',
        title: 'PR',
        exportPath: 'relative/path.md',
      })
    ).rejects.toThrow('exportPath must be an absolute path');
  });

  it('writes a file with correct Verdict label for approve', async () => {
    const exportPath = makeTmpPath();
    await exportReviewMarkdown({
      verdict: 'approve',
      body: 'LGTM',
      threads: {},
      baseRef: 'main',
      headRef: 'feat',
      title: 'PR',
      exportPath,
    });
    const content = await fs.readFile(exportPath, 'utf-8');
    expect(content).toContain('**Verdict:** Approve');
  });

  it('writes a file with correct Verdict label for comment', async () => {
    const exportPath = makeTmpPath();
    await exportReviewMarkdown({
      verdict: 'comment',
      body: 'Some comments',
      threads: {},
      baseRef: 'main',
      headRef: 'feat',
      title: 'PR',
      exportPath,
    });
    const content = await fs.readFile(exportPath, 'utf-8');
    expect(content).toContain('**Verdict:** Comment');
  });
});
