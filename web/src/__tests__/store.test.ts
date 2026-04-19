import { describe, it, expect, beforeEach } from 'vitest';
import type { ReviewSession, SnapshotMessage, UpdateMessage } from '@shared/types';

/**
 * Unit tests for web/src/store.ts (Plan 02-04 Task 2).
 *
 * These tests exercise the reducer actions directly (actions.onSnapshot,
 * actions.onUpdate, actions.setSource) and read back via a lightweight
 * getStateForTesting helper exported from the store.
 */

/** Base synthetic session used across tests. */
function baseSession(overrides: Partial<ReviewSession> = {}): ReviewSession {
  return {
    prKey: 'gh:o/r#1',
    pr: {
      source: 'github',
      title: 'Test PR',
      description: '',
      author: 'me',
      baseBranch: 'main',
      headBranch: 'feat',
      baseSha: 'b000',
      headSha: 'h000',
      additions: 0,
      deletions: 0,
      filesChanged: 0,
    },
    diff: { files: [], totalHunks: 0 },
    shikiTokens: {},
    createdAt: '2026-04-19T00:00:00Z',
    headSha: 'h000',
    error: null,
    lastEventId: 0,
    ...overrides,
  };
}

function snapshot(session: ReviewSession): SnapshotMessage {
  return {
    type: 'snapshot',
    session,
    launchUrl: 'http://127.0.0.1:8080/?token=t&session=gh:o/r%231',
    tokenLast4: 'tttt',
  };
}

describe('store reducer actions', () => {
  beforeEach(async () => {
    // Reset store state between tests by re-importing with a clean module graph.
    const { __resetForTesting } = await import('../store');
    __resetForTesting();
  });

  it('onSnapshot propagates staleDiff into AppState', async () => {
    const { actions, __getStateForTesting } = await import('../store');
    actions.onSnapshot(
      snapshot(
        baseSession({
          staleDiff: { storedSha: 'aaaaaaaa', currentSha: 'bbbbbbbb' },
        })
      )
    );
    expect(__getStateForTesting().staleDiff).toEqual({
      storedSha: 'aaaaaaaa',
      currentSha: 'bbbbbbbb',
    });
  });

  it('onSnapshot clears staleDiff when the next snapshot omits it', async () => {
    const { actions, __getStateForTesting } = await import('../store');
    actions.onSnapshot(
      snapshot(
        baseSession({
          staleDiff: { storedSha: 'aaaaaaaa', currentSha: 'bbbbbbbb' },
        })
      )
    );
    expect(__getStateForTesting().staleDiff).toBeDefined();
    actions.onSnapshot(snapshot(baseSession()));
    expect(__getStateForTesting().staleDiff).toBeUndefined();
  });

  it('onUpdate replaces diff/pr/shikiTokens and clears staleDiff when the update omits it', async () => {
    const { actions, __getStateForTesting } = await import('../store');
    // Seed with a stale-diff snapshot
    actions.onSnapshot(
      snapshot(
        baseSession({
          staleDiff: { storedSha: 'aaaaaaaa', currentSha: 'bbbbbbbb' },
        })
      )
    );

    const newDiff = { files: [], totalHunks: 7 };
    const newShikiTokens = { file1: [] };
    const newPr = { ...baseSession().pr, title: 'Updated title' };

    const update: UpdateMessage = {
      type: 'update',
      event: { type: 'session.viewBoth' },
      state: {
        ...baseSession({
          diff: newDiff,
          shikiTokens: newShikiTokens,
          pr: newPr,
          lastEventId: 1,
          viewBothMode: true,
          // staleDiff intentionally omitted — the server's update cleared it.
        }),
      },
    };
    actions.onUpdate(update);

    const s = __getStateForTesting();
    expect(s.diff).toEqual(newDiff);
    expect(s.shikiTokens).toEqual(newShikiTokens);
    expect(s.pr?.title).toBe('Updated title');
    expect(s.staleDiff).toBeUndefined();
  });

  it('onSnapshot sets sessionKey from session.prKey', async () => {
    const { actions, __getStateForTesting } = await import('../store');
    actions.onSnapshot(snapshot(baseSession({ prKey: 'gh:foo/bar#42' })));
    expect(__getStateForTesting().sessionKey).toBe('gh:foo/bar#42');
  });

  it('setSource stores the source on AppState', async () => {
    const { actions, __getStateForTesting } = await import('../store');
    actions.setSource({ kind: 'github', number: 1 });
    expect(__getStateForTesting().source).toEqual({ kind: 'github', number: 1 });
  });

  it('onSnapshot populates headShaError when session.error.message starts with "head-sha-check-failed:"', async () => {
    const { actions, __getStateForTesting } = await import('../store');
    actions.onSnapshot(
      snapshot(
        baseSession({
          error: {
            variant: 'fetch-failed',
            message: 'head-sha-check-failed: gh down',
          },
        })
      )
    );
    const s = __getStateForTesting();
    expect(s.headShaError).toEqual({
      variant: 'head-sha-check-failed',
      message: 'head-sha-check-failed: gh down',
    });
  });
});
