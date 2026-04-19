import { describe, it, expect } from 'vitest';
import type { ReviewSession, SessionEvent } from '@shared/types';
import { applyEvent } from '../reducer.js';

const fixture = (): ReviewSession => ({
  prKey: 'gh:o/r#1',
  pr: {
    source: 'github',
    title: 'Test PR',
    description: 'test',
    author: 'user',
    baseBranch: 'main',
    headBranch: 'feat',
    baseSha: 'base000',
    headSha: 'abc123',
    additions: 0,
    deletions: 0,
    filesChanged: 0,
  },
  diff: { files: [], totalHunks: 0 },
  shikiTokens: {},
  createdAt: '2026-04-19T00:00:00.000Z',
  headSha: 'abc123',
  error: null,
  lastEventId: 0,
});

describe('applyEvent', () => {
  it('session.adoptNewDiff replaces diff/headSha/shikiTokens and clears staleDiff', () => {
    const input: ReviewSession = {
      ...fixture(),
      headSha: 'abc123',
      pr: { ...fixture().pr, headSha: 'abc123' },
      staleDiff: { storedSha: 'abc123', currentSha: 'def456' },
      shikiTokens: { f1: [] },
      diff: { files: [], totalHunks: 0 },
    };
    const event: SessionEvent = {
      type: 'session.adoptNewDiff',
      newDiff: {
        files: [
          {
            id: 'x',
            path: 'x.ts',
            status: 'modified',
            binary: false,
            hunks: [],
          },
        ],
        totalHunks: 0,
      },
      newHeadSha: 'def456',
      newShikiTokens: {},
    };

    const result = applyEvent(input, event);

    expect(result.headSha).toBe('def456');
    expect(result.pr.headSha).toBe('def456');
    expect(result.staleDiff).toBeUndefined();
    expect(result.diff.files.length).toBe(1);
    expect(result.shikiTokens).toEqual({});
    // Ensure shikiTokens is the new object (not the old { f1: [] })
    expect('f1' in result.shikiTokens).toBe(false);
  });

  it('session.reset sets pendingReset flag without mutating input', () => {
    const input = fixture();
    expect(input.pendingReset).toBeUndefined();

    const result = applyEvent(input, { type: 'session.reset' });

    expect(result.pendingReset).toBe(true);
    // Other fields unchanged
    expect(result.prKey).toBe(input.prKey);
    expect(result.headSha).toBe(input.headSha);
    expect(result.diff).toBe(input.diff); // shallow spread preserves reference
  });

  it('session.viewBoth sets viewBothMode and clears staleDiff', () => {
    const input: ReviewSession = {
      ...fixture(),
      staleDiff: { storedSha: 'a', currentSha: 'b' },
    };
    expect(input.viewBothMode).toBeUndefined();

    const result = applyEvent(input, { type: 'session.viewBoth' });

    expect(result.viewBothMode).toBe(true);
    expect(result.staleDiff).toBeUndefined();
  });

  it('unknown event type throws', () => {
    const input = fixture();
    // @ts-expect-error — testing the runtime guard for an event not in the union
    const bogus: SessionEvent = { type: 'not-a-real-event' };

    expect(() => applyEvent(input, bogus)).toThrow(/Unknown event type/);
  });

  it('reducer does not mutate input session (frozen input survives)', () => {
    const input = fixture();
    input.pendingReset = false;
    Object.freeze(input);

    const result = applyEvent(input, { type: 'session.reset' });

    // Input still has pendingReset=false (never mutated)
    expect(input.pendingReset).toBe(false);
    // Result is a distinct object
    expect(result).not.toBe(input);
    expect(result.pendingReset).toBe(true);
  });

  it('lastEventId is preserved by reducer — reducer does NOT increment it', () => {
    const input: ReviewSession = { ...fixture(), lastEventId: 5 };

    const result = applyEvent(input, { type: 'session.reset' });

    expect(result.lastEventId).toBe(5);
  });
});
