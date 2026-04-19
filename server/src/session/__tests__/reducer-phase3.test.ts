import { describe, it, expect } from 'vitest';
import { applyEvent } from '../reducer.js';
import type { ReviewSession, ReadOnlyComment, CIStatus } from '@shared/types';

function baseSession(): ReviewSession {
  return {
    prKey: 'gh:example/repo#1',
    pr: {
      source: 'github',
      title: 't',
      description: '',
      author: 'a',
      baseBranch: 'main',
      headBranch: 'f',
      baseSha: 'b',
      headSha: 'h',
      additions: 0,
      deletions: 0,
      filesChanged: 0,
      number: 1,
      owner: 'example',
      repo: 'repo',
    },
    diff: { files: [], totalHunks: 0 },
    shikiTokens: {},
    createdAt: '2026-04-19T00:00:00Z',
    headSha: 'h',
    error: null,
    lastEventId: 42,
  };
}

describe('reducer Phase 3 events', () => {
  describe('file.reviewStatusSet', () => {
    it('sets a file status on empty map and returns new object', () => {
      const s = baseSession();
      const out = applyEvent(s, {
        type: 'file.reviewStatusSet',
        fileId: 'f1',
        status: 'reviewed',
      });
      expect(out).not.toBe(s);
      expect(out.fileReviewStatus).toEqual({ f1: 'reviewed' });
      expect(out.lastEventId).toBe(42); // reducer never touches lastEventId
    });

    it('merges new fileId entries into existing map', () => {
      const s = { ...baseSession(), fileReviewStatus: { fA: 'in-progress' as const } };
      const out = applyEvent(s, {
        type: 'file.reviewStatusSet',
        fileId: 'fB',
        status: 'reviewed',
      });
      expect(out.fileReviewStatus).toEqual({ fA: 'in-progress', fB: 'reviewed' });
    });

    it('overwrites status for same fileId', () => {
      const s = { ...baseSession(), fileReviewStatus: { fA: 'reviewed' as const } };
      const out = applyEvent(s, {
        type: 'file.reviewStatusSet',
        fileId: 'fA',
        status: 'in-progress',
      });
      expect(out.fileReviewStatus).toEqual({ fA: 'in-progress' });
    });
  });

  describe('file.generatedExpandToggled', () => {
    it('sets expanded flag on empty map', () => {
      const out = applyEvent(baseSession(), {
        type: 'file.generatedExpandToggled',
        fileId: 'lock',
        expanded: true,
      });
      expect(out.expandedGeneratedFiles).toEqual({ lock: true });
    });

    it('toggles false → true → false idempotently', () => {
      let s = baseSession();
      s = applyEvent(s, {
        type: 'file.generatedExpandToggled',
        fileId: 'lock',
        expanded: true,
      });
      s = applyEvent(s, {
        type: 'file.generatedExpandToggled',
        fileId: 'lock',
        expanded: false,
      });
      expect(s.expandedGeneratedFiles).toEqual({ lock: false });
    });
  });

  describe('existingComments.loaded', () => {
    it('replaces the comments array', () => {
      const comments: ReadOnlyComment[] = [
        {
          id: 1,
          lineId: 'x:h0:l0',
          path: 'a.ts',
          line: 1,
          side: 'RIGHT',
          author: 'alice',
          createdAt: '2026-04-01T00:00:00Z',
          body: 'lgtm',
          htmlUrl: 'https://x',
        },
      ];
      const out = applyEvent(baseSession(), { type: 'existingComments.loaded', comments });
      expect(out.existingComments).toEqual(comments);
    });

    it('replaces (does not merge) on a second load', () => {
      let s = applyEvent(baseSession(), {
        type: 'existingComments.loaded',
        comments: [
          {
            id: 1,
            lineId: null,
            path: 'a',
            line: 1,
            side: 'RIGHT',
            author: 'a',
            createdAt: '',
            body: 'x',
            htmlUrl: '',
          },
        ],
      });
      s = applyEvent(s, { type: 'existingComments.loaded', comments: [] });
      expect(s.existingComments).toEqual([]);
    });
  });

  describe('ciChecks.loaded', () => {
    it('replaces the ciStatus', () => {
      const cs: CIStatus = {
        aggregate: 'pass',
        checks: [{ name: 'ci', bucket: 'pass', link: 'https://x' }],
      };
      const out = applyEvent(baseSession(), { type: 'ciChecks.loaded', ciStatus: cs });
      expect(out.ciStatus).toEqual(cs);
    });
  });
});
