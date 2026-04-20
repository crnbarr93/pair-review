import { describe, it, expect } from 'vitest';
import { applyEvent } from '../reducer.js';
import type {
  ReviewSession,
  PrSummary,
  SelfReview,
  ResolvedFinding,
  CategoryCoverage,
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

function makeSummary(overrides?: Partial<PrSummary>): PrSummary {
  return {
    intent: 'bug-fix',
    intentConfidence: 0.92,
    paraphrase: 'Author claims: fix null deref in verifyToken.',
    keyChanges: ['Add null check before dereferencing user token'],
    riskAreas: ['Auth-middleware boundary'],
    generatedAt: '2026-04-20T01:00:00Z',
    ...overrides,
  };
}

function makeCoverage(): CategoryCoverage {
  return {
    correctness: 'pass',
    security: 'partial',
    tests: 'fail',
    performance: 'pass',
    style: 'pass',
  };
}

function makeFinding(id: string, severity: ResolvedFinding['severity'] = 'major'): ResolvedFinding {
  return {
    id,
    category: 'correctness',
    checklistItemId: 'c-01',
    severity,
    lineId: 'f1:h0:l5',
    path: 'src/auth.ts',
    line: 42,
    side: 'RIGHT',
    title: 'Null check missing in verifyToken',
    rationale: 'When jwt.decode returns null, verifyToken dereferences .payload without a guard.',
  };
}

function makeSelfReview(overrides?: Partial<SelfReview>): SelfReview {
  return {
    findings: [makeFinding('f-0001')],
    coverage: makeCoverage(),
    verdict: 'request_changes',
    generatedAt: '2026-04-20T02:00:00Z',
    ...overrides,
  };
}

describe('reducer Phase 4 events', () => {
  describe('summary.set', () => {
    it('sets summary on a session with no prior summary', () => {
      const s = baseSession();
      const summary = makeSummary();
      const out = applyEvent(s, { type: 'summary.set', summary });
      expect(out).not.toBe(s);
      expect(out.summary).toBe(summary);
      expect(out.lastEventId).toBe(7);
    });

    it('replaces (does NOT merge) on re-setting summary', () => {
      let s: ReviewSession = { ...baseSession(), summary: makeSummary({ paraphrase: 'OLD paraphrase' }) };
      const next = makeSummary({ paraphrase: 'NEW paraphrase', keyChanges: ['completely different'] });
      s = applyEvent(s, { type: 'summary.set', summary: next });
      expect(s.summary).toBe(next);
      expect(s.summary?.paraphrase).toBe('NEW paraphrase');
      expect(s.summary?.keyChanges).toEqual(['completely different']);
    });

    it('leaves all other ReviewSession fields byte-for-byte identical', () => {
      const s = baseSession();
      const summary = makeSummary();
      const out = applyEvent(s, { type: 'summary.set', summary });
      expect(out.prKey).toBe(s.prKey);
      expect(out.pr).toBe(s.pr);
      expect(out.diff).toBe(s.diff);
      expect(out.shikiTokens).toBe(s.shikiTokens);
      expect(out.createdAt).toBe(s.createdAt);
      expect(out.headSha).toBe(s.headSha);
      expect(out.error).toBe(s.error);
      expect(out.lastEventId).toBe(s.lastEventId);
    });

    it('last-write-wins across 3 successive summary.set events', () => {
      let s: ReviewSession = baseSession();
      for (let i = 0; i < 3; i++) {
        s = applyEvent(s, { type: 'summary.set', summary: makeSummary({ paraphrase: `rev-${i}` }) });
      }
      expect(s.summary?.paraphrase).toBe('rev-2');
    });
  });

  describe('selfReview.set', () => {
    it('sets selfReview on a session with no prior selfReview', () => {
      const s = baseSession();
      const selfReview = makeSelfReview();
      const out = applyEvent(s, { type: 'selfReview.set', selfReview });
      expect(out).not.toBe(s);
      expect(out.selfReview).toBe(selfReview);
      expect(out.lastEventId).toBe(7);
    });

    it('replaces (does NOT merge) on re-setting selfReview — findings array is overwritten', () => {
      let s: ReviewSession = {
        ...baseSession(),
        selfReview: makeSelfReview({ findings: [makeFinding('f-old', 'blocker')] }),
      };
      const next = makeSelfReview({ findings: [makeFinding('f-new', 'minor')], verdict: 'approve' });
      s = applyEvent(s, { type: 'selfReview.set', selfReview: next });
      expect(s.selfReview).toBe(next);
      expect(s.selfReview?.findings).toHaveLength(1);
      expect(s.selfReview?.findings[0].id).toBe('f-new');
      expect(s.selfReview?.verdict).toBe('approve');
    });

    it('leaves all other ReviewSession fields untouched', () => {
      const s: ReviewSession = { ...baseSession(), summary: makeSummary() };
      const sr = makeSelfReview();
      const out = applyEvent(s, { type: 'selfReview.set', selfReview: sr });
      expect(out.summary).toBe(s.summary);
      expect(out.pr).toBe(s.pr);
      expect(out.diff).toBe(s.diff);
      expect(out.lastEventId).toBe(s.lastEventId);
    });
  });

  describe('purity invariants', () => {
    it('does not mutate the input session on summary.set', () => {
      const s = baseSession();
      const snapshot = JSON.stringify(s);
      applyEvent(s, { type: 'summary.set', summary: makeSummary() });
      expect(JSON.stringify(s)).toBe(snapshot);
    });

    it('does not mutate the input session on selfReview.set', () => {
      const s = baseSession();
      const snapshot = JSON.stringify(s);
      applyEvent(s, { type: 'selfReview.set', selfReview: makeSelfReview() });
      expect(JSON.stringify(s)).toBe(snapshot);
    });
  });
});
