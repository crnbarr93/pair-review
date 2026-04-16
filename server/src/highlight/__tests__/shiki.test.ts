import { describe, it, expect, beforeEach } from 'vitest';
import type { Hunk } from '@shared/types';

// A minimal hunk for testing
function makeHunk(id: string, lineText: string): Hunk {
  return {
    id,
    header: '@@ -1,1 +1,1 @@',
    lines: [
      {
        id: id + ':l0',
        kind: 'add',
        side: 'RIGHT',
        fileLine: 1,
        diffPosition: 1,
        text: lineText,
      },
    ],
  };
}

describe('highlightHunks', () => {
  beforeEach(async () => {
    // Reset highlighter + cache between tests to ensure isolation
    const { resetHighlighterForTests } = await import('../shiki.js');
    resetHighlighterForTests();
  });

  it('highlights TypeScript hunk and returns non-empty tokens', async () => {
    const { highlightHunks } = await import('../shiki.js');
    const hunks: Hunk[] = [makeHunk('abc123:h0', '+const x = 1;')];
    const result = await highlightHunks('foo.ts', 'sha1', hunks);

    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(1); // one hunk
    expect(result[0]).toBeInstanceOf(Array); // one hunk → array of lines
    expect(result[0].length).toBe(1); // one line
    expect(result[0][0]).toBeInstanceOf(Array); // one line → array of tokens
    expect(result[0][0].length).toBeGreaterThan(0); // tokens are non-empty
  }, 15000);

  it('returns cached tokens on second call (same path+headSha)', async () => {
    const { highlightHunks } = await import('../shiki.js');
    const hunks: Hunk[] = [makeHunk('abc123:h0', '+const x = 1;')];

    const result1 = await highlightHunks('foo.ts', 'sha1', hunks);
    const result2 = await highlightHunks('foo.ts', 'sha1', hunks);

    // Strict identity — same array instance, not just equal content
    expect(result2).toBe(result1);
  }, 15000);

  it('different path produces a different cache entry (not the same instance)', async () => {
    const { highlightHunks } = await import('../shiki.js');
    const hunks: Hunk[] = [makeHunk('abc123:h0', '+const x = 1;')];

    const result1 = await highlightHunks('foo.ts', 'sha1', hunks);
    const result2 = await highlightHunks('bar.ts', 'sha1', hunks);

    // Different cache keys → different instances (but both valid arrays)
    expect(result2).not.toBe(result1);
    expect(result2).toBeInstanceOf(Array);
  }, 15000);

  it('different headSha produces a different cache entry', async () => {
    const { highlightHunks } = await import('../shiki.js');
    const hunks: Hunk[] = [makeHunk('abc123:h0', '+const x = 1;')];

    const result1 = await highlightHunks('foo.ts', 'sha1', hunks);
    const result2 = await highlightHunks('foo.ts', 'sha2', hunks);

    expect(result2).not.toBe(result1);
  }, 15000);

  it('falls back to plaintext for unknown extension without throwing', async () => {
    const { highlightHunks } = await import('../shiki.js');
    const hunks: Hunk[] = [makeHunk('abc123:h0', '+some unknown content')];

    await expect(
      highlightHunks('mystery-file.xyz', 'sha1', hunks)
    ).resolves.toBeInstanceOf(Array);
  }, 15000);

  it('handles empty hunks array', async () => {
    const { highlightHunks } = await import('../shiki.js');
    const result = await highlightHunks('foo.ts', 'sha1', []);
    expect(result).toEqual([]);
  }, 15000);

  it('returns one inner-hunk array per hunk', async () => {
    const { highlightHunks } = await import('../shiki.js');
    const hunks: Hunk[] = [
      makeHunk('abc123:h0', '+const x = 1;'),
      makeHunk('abc123:h1', '+const y = 2;'),
    ];
    const result = await highlightHunks('foo.ts', 'sha1', hunks);
    expect(result.length).toBe(2);
  }, 15000);
});
