/**
 * Phase 06.3 reducer tests — verifies that server/src/session/reducer.ts
 * correctly handles the finding.validitySet SessionEvent variant (D-15).
 *
 * TDD RED: These tests fail until the finding.validitySet case branch is added to reducer.ts
 * and the validity field is added to ResolvedFinding in shared/types.ts.
 */
import { describe, it, expect } from 'vitest';
import { applyEvent } from '../reducer.js';
import type { ReviewSession, ResolvedFinding, ChecklistCategory, Severity, LineSide } from '@shared/types';

function baseSession(): ReviewSession {
  return {
    prKey: 'gh:owner/repo#1',
    pr: {
      source: 'github',
      title: 'Test PR',
      description: 'Test description.',
      author: 'testuser',
      baseBranch: 'main',
      headBranch: 'feature/test',
      baseSha: 'aaa111',
      headSha: 'abc',
      additions: 10,
      deletions: 2,
      filesChanged: 2,
      number: 1,
      owner: 'owner',
      repo: 'repo',
    },
    diff: { files: [], totalHunks: 0 },
    shikiTokens: {},
    createdAt: '2026-04-27T00:00:00Z',
    headSha: 'abc',
    error: null,
    lastEventId: 0,
  };
}

function makeFinding(id: string): ResolvedFinding {
  return {
    id,
    category: 'correctness' as ChecklistCategory,
    checklistItemId: 'chk-01',
    severity: 'medium' as Severity,
    lineId: `file:h0:l${id}`,
    path: 'src/foo.ts',
    line: 10,
    side: 'RIGHT' as LineSide,
    title: `Finding ${id}`,
    rationale: `Rationale for ${id}`,
  };
}

function baseSessionWithFindings(): ReviewSession {
  return {
    ...baseSession(),
    selfReview: {
      findings: [makeFinding('f1'), makeFinding('f2')],
      coverage: {
        correctness: { total: 2, covered: 2 },
        security: { total: 0, covered: 0 },
        performance: { total: 0, covered: 0 },
        maintainability: { total: 0, covered: 0 },
      },
      verdict: 'request_changes',
      generatedAt: '2026-04-27T00:00:00Z',
    },
  };
}

describe('reducer Phase 06.3 events — finding.validitySet', () => {
  it('sets validity to invalid for matching finding (Test 1)', () => {
    const s = baseSessionWithFindings();
    const out = applyEvent(s, {
      type: 'finding.validitySet',
      findingId: 'f1',
      validity: 'invalid',
    });
    expect(out).not.toBe(s);
    const f1 = out.selfReview!.findings.find(f => f.id === 'f1');
    expect(f1?.validity).toBe('invalid');
  });

  it('sets validity to valid for matching finding (Test 2)', () => {
    const s = baseSessionWithFindings();
    const out = applyEvent(s, {
      type: 'finding.validitySet',
      findingId: 'f2',
      validity: 'valid',
    });
    expect(out).not.toBe(s);
    const f2 = out.selfReview!.findings.find(f => f.id === 'f2');
    expect(f2?.validity).toBe('valid');
  });

  it('does not mutate other findings when setting validity on one', () => {
    const s = baseSessionWithFindings();
    const out = applyEvent(s, {
      type: 'finding.validitySet',
      findingId: 'f1',
      validity: 'invalid',
    });
    const f2 = out.selfReview!.findings.find(f => f.id === 'f2');
    expect(f2?.validity).toBeUndefined();
  });

  it('returns session unchanged when findingId does not exist (Test 3)', () => {
    const s = baseSessionWithFindings();
    const out = applyEvent(s, {
      type: 'finding.validitySet',
      findingId: 'nonexistent',
      validity: 'invalid',
    });
    // Should not crash and findings should be unchanged
    expect(out.selfReview!.findings).toHaveLength(2);
    expect(out.selfReview!.findings.find(f => f.id === 'f1')?.validity).toBeUndefined();
    expect(out.selfReview!.findings.find(f => f.id === 'f2')?.validity).toBeUndefined();
  });

  it('returns session unchanged when selfReview is null/undefined (Test 4)', () => {
    const s = baseSession(); // no selfReview
    expect(s.selfReview).toBeUndefined();
    const out = applyEvent(s, {
      type: 'finding.validitySet',
      findingId: 'f1',
      validity: 'invalid',
    });
    expect(out).toBe(s);
    expect(out.selfReview).toBeUndefined();
  });

  it('does not mutate original session (purity check)', () => {
    const s = baseSessionWithFindings();
    const snapshot = JSON.stringify(s);
    applyEvent(s, {
      type: 'finding.validitySet',
      findingId: 'f1',
      validity: 'invalid',
    });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
