import { describe, it, expect } from 'vitest';
import { applyEvent } from '../reducer.js';
import type {
  ReviewSession,
  Walkthrough,
  WalkthroughStep,
  Thread,
  ThreadTurn,
} from '@shared/types';

function baseSession(): ReviewSession {
  return {
    prKey: 'gh:example/repo#42',
    pr: {
      source: 'github',
      title: 'Fix null deref in auth middleware',
      description: 'Adds missing null check in verifyToken.',
      author: 'alice',
      baseBranch: 'main',
      headBranch: 'fix/null-deref',
      baseSha: 'aaa111',
      headSha: 'bbb222',
      additions: 5,
      deletions: 1,
      filesChanged: 1,
      number: 42,
      owner: 'example',
      repo: 'repo',
    },
    diff: { files: [], totalHunks: 0 },
    shikiTokens: {},
    createdAt: '2026-04-20T00:00:00Z',
    headSha: 'bbb222',
    error: null,
    lastEventId: 7,
  };
}

function makeStep(stepNum: number, hunkId: string): WalkthroughStep {
  return {
    stepNum,
    hunkId,
    commentary: `Step ${stepNum} commentary`,
    status: 'pending',
  };
}

function makeWalkthrough(stepCount = 3): Walkthrough {
  return {
    steps: Array.from({ length: stepCount }, (_, i) => makeStep(i + 1, `fileA:h${i}`)),
    cursor: 0,
    showAll: false,
    generatedAt: '2026-04-20T01:00:00Z',
  };
}

function makeThread(threadId: string, lineId = 'fileA:h0:l0'): Thread {
  const turn: ThreadTurn = {
    author: 'llm',
    message: 'This looks suspicious.',
    createdAt: '2026-04-20T02:00:00Z',
  };
  return {
    threadId,
    lineId,
    path: 'src/auth.ts',
    line: 42,
    side: 'RIGHT',
    preExisting: false,
    turns: [turn],
    resolved: false,
    createdAt: '2026-04-20T02:00:00Z',
  };
}

describe('reducer Phase 5 events', () => {
  describe('walkthrough.set', () => {
    it('sets walkthrough on a session with no prior walkthrough', () => {
      const s = baseSession();
      const walkthrough = makeWalkthrough();
      const out = applyEvent(s, { type: 'walkthrough.set', walkthrough });
      expect(out).not.toBe(s);
      expect(out.walkthrough).toBe(walkthrough);
      expect(out.lastEventId).toBe(7);
    });

    it('overwrites an existing walkthrough (atomic replace, not merge)', () => {
      const s: ReviewSession = { ...baseSession(), walkthrough: makeWalkthrough(5) };
      const next = makeWalkthrough(2);
      const out = applyEvent(s, { type: 'walkthrough.set', walkthrough: next });
      expect(out.walkthrough).toBe(next);
      expect(out.walkthrough?.steps).toHaveLength(2);
    });
  });

  describe('walkthrough.stepAdvanced', () => {
    it('updates cursor and marks prior pending steps as visited', () => {
      const walkthrough = makeWalkthrough(3);
      const s: ReviewSession = { ...baseSession(), walkthrough };
      const out = applyEvent(s, { type: 'walkthrough.stepAdvanced', cursor: 2 });
      expect(out.walkthrough?.cursor).toBe(2);
      // Steps at index 0 and 1 (i < 2) were pending — should now be visited
      expect(out.walkthrough?.steps[0].status).toBe('visited');
      expect(out.walkthrough?.steps[1].status).toBe('visited');
      // Step at index 2 (the new cursor) remains pending
      expect(out.walkthrough?.steps[2].status).toBe('pending');
    });

    it('returns session unchanged when walkthrough is null/undefined', () => {
      const s = baseSession(); // walkthrough is undefined
      const out = applyEvent(s, { type: 'walkthrough.stepAdvanced', cursor: 1 });
      expect(out.walkthrough).toBeUndefined();
      expect(out).not.toBe(s); // still returns a new object (spread)
    });
  });

  describe('walkthrough.showAllToggled', () => {
    it('sets showAll to true on existing walkthrough', () => {
      const walkthrough: Walkthrough = { ...makeWalkthrough(), showAll: false };
      const s: ReviewSession = { ...baseSession(), walkthrough };
      const out = applyEvent(s, { type: 'walkthrough.showAllToggled', showAll: true });
      expect(out.walkthrough?.showAll).toBe(true);
    });

    it('sets showAll to false on existing walkthrough', () => {
      const walkthrough: Walkthrough = { ...makeWalkthrough(), showAll: true };
      const s: ReviewSession = { ...baseSession(), walkthrough };
      const out = applyEvent(s, { type: 'walkthrough.showAllToggled', showAll: false });
      expect(out.walkthrough?.showAll).toBe(false);
    });

    it('returns session unchanged when walkthrough is null/undefined', () => {
      const s = baseSession();
      const out = applyEvent(s, { type: 'walkthrough.showAllToggled', showAll: true });
      expect(out.walkthrough).toBeUndefined();
    });
  });

  describe('thread.replyAdded', () => {
    it('adds a new thread to an empty threads record', () => {
      const s = baseSession();
      const thread = makeThread('th_abc123');
      const out = applyEvent(s, { type: 'thread.replyAdded', threadId: 'th_abc123', thread });
      expect(out.threads).toBeDefined();
      expect(out.threads?.['th_abc123']).toBe(thread);
    });

    it('adds a second thread alongside an existing thread', () => {
      const thread1 = makeThread('th_first');
      const s: ReviewSession = { ...baseSession(), threads: { th_first: thread1 } };
      const thread2 = makeThread('th_second', 'fileA:h0:l5');
      const out = applyEvent(s, { type: 'thread.replyAdded', threadId: 'th_second', thread: thread2 });
      expect(out.threads?.['th_first']).toBe(thread1);
      expect(out.threads?.['th_second']).toBe(thread2);
    });

    it('overwrites an existing thread (full thread object replacement for turn append)', () => {
      const original = makeThread('th_abc123');
      const s: ReviewSession = { ...baseSession(), threads: { th_abc123: original } };
      const updated: Thread = {
        ...original,
        turns: [
          ...original.turns,
          { author: 'user', message: 'I agree.', createdAt: '2026-04-20T03:00:00Z' },
        ],
      };
      const out = applyEvent(s, { type: 'thread.replyAdded', threadId: 'th_abc123', thread: updated });
      expect(out.threads?.['th_abc123']).toBe(updated);
      expect(out.threads?.['th_abc123'].turns).toHaveLength(2);
    });
  });

  describe('thread.draftSet', () => {
    it('sets draftBody on an existing thread', () => {
      const thread = makeThread('th_abc123');
      const s: ReviewSession = { ...baseSession(), threads: { th_abc123: thread } };
      const out = applyEvent(s, { type: 'thread.draftSet', threadId: 'th_abc123', body: 'Draft text here.' });
      expect(out.threads?.['th_abc123'].draftBody).toBe('Draft text here.');
      // Other thread fields unchanged
      expect(out.threads?.['th_abc123'].lineId).toBe(thread.lineId);
      expect(out.threads?.['th_abc123'].turns).toBe(thread.turns);
    });

    it('returns session unchanged when threads is undefined', () => {
      const s = baseSession();
      const out = applyEvent(s, { type: 'thread.draftSet', threadId: 'th_abc123', body: 'Draft.' });
      expect(out.threads).toBeUndefined();
    });
  });

  describe('thread.resolved', () => {
    it('sets resolved: true on an existing thread', () => {
      const thread = makeThread('th_abc123');
      expect(thread.resolved).toBe(false);
      const s: ReviewSession = { ...baseSession(), threads: { th_abc123: thread } };
      const out = applyEvent(s, { type: 'thread.resolved', threadId: 'th_abc123' });
      expect(out.threads?.['th_abc123'].resolved).toBe(true);
      // Other fields unchanged
      expect(out.threads?.['th_abc123'].lineId).toBe(thread.lineId);
    });

    it('returns session unchanged when threads is undefined', () => {
      const s = baseSession();
      const out = applyEvent(s, { type: 'thread.resolved', threadId: 'th_abc123' });
      expect(out.threads).toBeUndefined();
    });
  });

  describe('purity invariants', () => {
    it('does not mutate the input session on walkthrough.set', () => {
      const s = baseSession();
      const snapshot = JSON.stringify(s);
      applyEvent(s, { type: 'walkthrough.set', walkthrough: makeWalkthrough() });
      expect(JSON.stringify(s)).toBe(snapshot);
    });

    it('does not mutate the input session on thread.replyAdded', () => {
      const s = baseSession();
      const snapshot = JSON.stringify(s);
      applyEvent(s, { type: 'thread.replyAdded', threadId: 'th_x', thread: makeThread('th_x') });
      expect(JSON.stringify(s)).toBe(snapshot);
    });
  });
});
