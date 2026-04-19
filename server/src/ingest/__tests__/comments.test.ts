import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DiffModel } from '@shared/types';

// Mock execa at the module level so fetchExistingComments uses a deterministic stub
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

// Also mock the logger so we can assert orphan-count logging
vi.mock('../../logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { execa } from 'execa';
import { logger } from '../../logger.js';
import { fetchExistingComments, resolveCommentAnchor } from '../github.js';

const sampleDiff: DiffModel = {
  totalHunks: 1,
  files: [
    {
      id: 'abc123def456',
      path: 'src/app.ts',
      status: 'modified',
      binary: false,
      generated: false,
      hunks: [
        {
          id: 'abc123def456:h0',
          header: '@@ -1,3 +1,3 @@',
          lines: [
            {
              id: 'abc123def456:h0:l0',
              kind: 'context',
              side: 'BOTH',
              fileLine: 1,
              diffPosition: 1,
              text: 'line1',
            },
            {
              id: 'abc123def456:h0:l1',
              kind: 'del',
              side: 'LEFT',
              fileLine: 2,
              diffPosition: 2,
              text: 'old',
            },
            {
              id: 'abc123def456:h0:l2',
              kind: 'add',
              side: 'RIGHT',
              fileLine: 2,
              diffPosition: 3,
              text: 'new',
            },
          ],
        },
      ],
    },
  ],
};

describe('resolveCommentAnchor', () => {
  it('resolves a RIGHT comment on an added line', () => {
    const id = resolveCommentAnchor(
      {
        id: 1,
        path: 'src/app.ts',
        line: 2,
        original_line: 2,
        side: 'RIGHT',
        user: { login: 'x' },
        body: '',
        created_at: '',
        html_url: '',
        in_reply_to_id: null,
      },
      sampleDiff
    );
    expect(id).toBe('abc123def456:h0:l2');
  });
  it('resolves a LEFT comment on a context line (Pitfall 12)', () => {
    const id = resolveCommentAnchor(
      {
        id: 1,
        path: 'src/app.ts',
        line: 1,
        original_line: 1,
        side: 'LEFT',
        user: { login: 'x' },
        body: '',
        created_at: '',
        html_url: '',
        in_reply_to_id: null,
      },
      sampleDiff
    );
    expect(id).toBe('abc123def456:h0:l0');
  });
  it('returns null when path is not in the diff (orphan)', () => {
    const id = resolveCommentAnchor(
      {
        id: 1,
        path: 'src/gone.ts',
        line: 2,
        original_line: 2,
        side: 'RIGHT',
        user: { login: 'x' },
        body: '',
        created_at: '',
        html_url: '',
        in_reply_to_id: null,
      },
      sampleDiff
    );
    expect(id).toBeNull();
  });
  it('falls back to original_line when line is null', () => {
    const id = resolveCommentAnchor(
      {
        id: 1,
        path: 'src/app.ts',
        line: null,
        original_line: 2,
        side: 'LEFT',
        user: { login: 'x' },
        body: '',
        created_at: '',
        html_url: '',
        in_reply_to_id: null,
      },
      sampleDiff
    );
    expect(id).toBe('abc123def456:h0:l1');
  });
});

describe('fetchExistingComments', () => {
  beforeEach(() => {
    vi.mocked(execa).mockReset();
    vi.mocked(logger.warn).mockReset();
  });

  it('normalizes inline comments and sets lineId from anchor resolution', async () => {
    vi.mocked(execa)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            id: 10,
            path: 'src/app.ts',
            line: 2,
            original_line: 2,
            side: 'RIGHT',
            user: { login: 'alice' },
            body: 'nit',
            created_at: '2026-04-01T00:00:00Z',
            html_url: 'https://x/10',
            in_reply_to_id: null,
          },
        ]),
        exitCode: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({ stdout: JSON.stringify([]), exitCode: 0 } as any);
    const out = await fetchExistingComments('o', 'r', 1, sampleDiff);
    expect(out).toHaveLength(1);
    expect(out[0].lineId).toBe('abc123def456:h0:l2');
    expect(out[0].author).toBe('alice');
    expect(out[0].body).toBe('nit');
  });

  it('counts and stderr-logs orphan comments (T-3-07: count only, no PII)', async () => {
    vi.mocked(execa)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            id: 20,
            path: 'gone.ts',
            line: 5,
            original_line: 5,
            side: 'RIGHT',
            user: { login: 'bob' },
            body: 'SECRET',
            created_at: '',
            html_url: '',
            in_reply_to_id: null,
          },
        ]),
        exitCode: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({ stdout: JSON.stringify([]), exitCode: 0 } as any);
    await fetchExistingComments('o', 'r', 1, sampleDiff);
    const call = vi.mocked(logger.warn).mock.calls[0];
    const logged = call?.join(' ') ?? '';
    expect(logged).toMatch(/orphan/i);
    expect(logged).toMatch(/1/);
    // T-3-07: never log body/author in orphan count message
    expect(logged).not.toContain('SECRET');
    expect(logged).not.toContain('bob');
  });

  it('uses gh api --paginate for comments', async () => {
    vi.mocked(execa)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as any);
    await fetchExistingComments('o', 'r', 1, sampleDiff);
    const firstCall = vi.mocked(execa).mock.calls[0];
    expect(firstCall[0]).toBe('gh');
    expect(firstCall[1]).toContain('api');
    expect(firstCall[1]).toContain('--paginate');
  });
});
