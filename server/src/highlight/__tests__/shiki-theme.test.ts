import { describe, it, expect, beforeEach } from 'vitest';
import { highlightHunks, resetHighlighterForTests } from '../shiki.js';
import type { Hunk } from '@shared/types';

describe('shiki theme (github-light)', () => {
  beforeEach(() => {
    resetHighlighterForTests();
  });

  it('emits dark ink colors suitable for the paper palette (Phase 3 T-3-01 visibility)', async () => {
    const fakeHunk: Hunk = {
      id: 'x:h0',
      header: '@@ -1 +1 @@',
      lines: [
        {
          id: 'x:h0:l0',
          kind: 'add',
          side: 'RIGHT',
          fileLine: 1,
          diffPosition: 1,
          text: 'const foo = 1;',
        },
      ],
    };
    const out = await highlightHunks('test.ts', 'HEAD', [fakeHunk]);
    // Should produce tokens for the single hunk
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1); // one line
    const line = out[0][0];
    // At least one token must have a color; none should be a blank-on-paper white/near-white (rules out github-dark accidentally left in)
    const coloredTokens = line.filter((t) => t.color);
    expect(coloredTokens.length).toBeGreaterThan(0);
    // Assert none of the colors is the github-dark default fg (#e6edf3) or a near-paper-white color
    for (const t of coloredTokens) {
      expect(t.color?.toLowerCase()).not.toBe('#e6edf3');
      expect(t.color?.toLowerCase()).not.toBe('#f0f6fc');
    }
  });
});
