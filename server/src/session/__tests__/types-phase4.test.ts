/**
 * Phase 4 type surface tests — verifies that shared/types.ts exports the complete
 * Phase 4 type surface: PrSummary, SelfReview, Finding, ResolvedFinding, enums,
 * SessionEvent union extensions, and ReviewSession/AppState field extensions.
 *
 * TDD RED: These tests fail until the types are added to shared/types.ts.
 */
import { describe, it, expect } from 'vitest';
import type {
  Severity,
  ChecklistCategory,
  Verdict,
  CategoryCoverage,
  SummaryIntent,
  PrSummary,
  Finding,
  ResolvedFinding,
  SelfReview,
  SessionEvent,
  ReviewSession,
  AppState,
  LineSide,
} from '@shared/types';

// ---------------------------------------------------------------------------
// Helper: compile-time type assertion utility
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function assertType<T>(_value: T): void {
  // compile-time only — no runtime assertion needed
}

// ---------------------------------------------------------------------------
// 1. Enum / literal-union types exist with correct members
// ---------------------------------------------------------------------------
describe('Phase 4 enum types', () => {
  it('Severity accepts all four levels', () => {
    const values: Severity[] = ['blocker', 'major', 'minor', 'nit'];
    expect(values).toHaveLength(4);
  });

  it('ChecklistCategory accepts all five categories', () => {
    const values: ChecklistCategory[] = [
      'correctness',
      'security',
      'tests',
      'performance',
      'style',
    ];
    expect(values).toHaveLength(5);
  });

  it('Verdict accepts the three verdict values', () => {
    const values: Verdict[] = ['request_changes', 'comment', 'approve'];
    expect(values).toHaveLength(3);
  });

  it('SummaryIntent accepts all five intents', () => {
    const values: SummaryIntent[] = ['bug-fix', 'refactor', 'feature', 'chore', 'other'];
    expect(values).toHaveLength(5);
  });

  it('CategoryCoverage is a Record of all five categories to pass/partial/fail', () => {
    const coverage: CategoryCoverage = {
      correctness: 'pass',
      security: 'partial',
      tests: 'fail',
      performance: 'pass',
      style: 'partial',
    };
    expect(Object.keys(coverage)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// 2. PrSummary interface shape
// ---------------------------------------------------------------------------
describe('PrSummary', () => {
  it('has the correct shape with all required fields', () => {
    const summary: PrSummary = {
      intent: 'feature',
      intentConfidence: 0.85,
      paraphrase: 'This PR adds a new feature.',
      keyChanges: ['Added feature X', 'Modified module Y'],
      riskAreas: ['Potential performance regression in Z'],
      generatedAt: '2026-04-20T00:00:00Z',
    };
    assertType<PrSummary>(summary);
    expect(summary.intent).toBe('feature');
    expect(summary.intentConfidence).toBe(0.85);
    expect(typeof summary.paraphrase).toBe('string');
    expect(Array.isArray(summary.keyChanges)).toBe(true);
    expect(Array.isArray(summary.riskAreas)).toBe(true);
    expect(typeof summary.generatedAt).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 3. Finding interface shape (pre-resolution, documentation type)
// ---------------------------------------------------------------------------
describe('Finding', () => {
  it('has the correct shape with lineId-only anchoring (D-04)', () => {
    const finding: Finding = {
      category: 'correctness',
      checklistItemId: 'c-01',
      severity: 'blocker',
      lineId: 'abc123:h0:l5',
      title: 'Missing null check',
      rationale: 'The variable could be null when accessed here.',
    };
    assertType<Finding>(finding);
    expect(finding.lineId).toBe('abc123:h0:l5');
    // Finding does NOT have path/line/side — those are on ResolvedFinding only
    expect('path' in finding).toBe(false);
    expect('line' in finding).toBe(false);
    expect('side' in finding).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. ResolvedFinding interface shape (post-resolution, stored in session)
// ---------------------------------------------------------------------------
describe('ResolvedFinding', () => {
  it('has both lineId and resolved path/line/side triplet (D-04)', () => {
    const resolved: ResolvedFinding = {
      id: 'finding-1',
      category: 'security',
      checklistItemId: 's-02',
      severity: 'major',
      lineId: 'abc123:h0:l5',
      path: 'src/auth.ts',
      line: 42,
      side: 'RIGHT' as LineSide,
      title: 'SQL injection risk',
      rationale: 'User input is interpolated directly into the query string.',
    };
    assertType<ResolvedFinding>(resolved);
    expect(resolved.id).toBe('finding-1');
    expect(resolved.path).toBe('src/auth.ts');
    expect(resolved.line).toBe(42);
    expect(resolved.side).toBe('RIGHT');
    expect(resolved.lineId).toBe('abc123:h0:l5');
  });
});

// ---------------------------------------------------------------------------
// 5. SelfReview interface shape
// ---------------------------------------------------------------------------
describe('SelfReview', () => {
  it('carries findings array, coverage, verdict, and generatedAt', () => {
    const selfReview: SelfReview = {
      findings: [
        {
          id: 'f-1',
          category: 'correctness',
          checklistItemId: 'c-01',
          severity: 'blocker',
          lineId: 'x:h0:l0',
          path: 'foo.ts',
          line: 1,
          side: 'RIGHT',
          title: 'Bug',
          rationale: 'Explanation.',
        },
      ],
      coverage: {
        correctness: 'fail',
        security: 'pass',
        tests: 'partial',
        performance: 'pass',
        style: 'pass',
      },
      verdict: 'request_changes',
      generatedAt: '2026-04-20T00:00:00Z',
    };
    assertType<SelfReview>(selfReview);
    expect(selfReview.findings).toHaveLength(1);
    expect(selfReview.verdict).toBe('request_changes');
  });
});

// ---------------------------------------------------------------------------
// 6. SessionEvent union — Phase 4 variants
// ---------------------------------------------------------------------------
describe('SessionEvent Phase 4 variants', () => {
  it('summary.set variant is valid', () => {
    const event: SessionEvent = {
      type: 'summary.set',
      summary: {
        intent: 'bug-fix',
        intentConfidence: 0.9,
        paraphrase: 'Fixes a null pointer bug.',
        keyChanges: ['Fixed null check in handler'],
        riskAreas: [],
        generatedAt: '2026-04-20T00:00:00Z',
      },
    };
    expect(event.type).toBe('summary.set');
  });

  it('selfReview.set variant is valid', () => {
    const event: SessionEvent = {
      type: 'selfReview.set',
      selfReview: {
        findings: [],
        coverage: {
          correctness: 'pass',
          security: 'pass',
          tests: 'pass',
          performance: 'pass',
          style: 'pass',
        },
        verdict: 'approve',
        generatedAt: '2026-04-20T00:00:00Z',
      },
    };
    expect(event.type).toBe('selfReview.set');
  });
});

// ---------------------------------------------------------------------------
// 7. ReviewSession Phase 4 field extensions
// ---------------------------------------------------------------------------
describe('ReviewSession Phase 4 fields', () => {
  it('accepts summary and selfReview optional fields', () => {
    // Minimal ReviewSession with Phase 4 fields set
    const session: ReviewSession = {
      prKey: 'gh:o/r#1',
      pr: {
        source: 'github',
        title: 'Test',
        description: '',
        author: 'u',
        baseBranch: 'main',
        headBranch: 'f',
        baseSha: 'b',
        headSha: 'h',
        additions: 0,
        deletions: 0,
        filesChanged: 0,
      },
      diff: { files: [], totalHunks: 0 },
      shikiTokens: {},
      createdAt: '2026-04-20T00:00:00Z',
      headSha: 'h',
      error: null,
      lastEventId: 0,
      // Phase 4 additions:
      summary: {
        intent: 'feature',
        intentConfidence: 1,
        paraphrase: 'test',
        keyChanges: [],
        riskAreas: [],
        generatedAt: '2026-04-20T00:00:00Z',
      },
      selfReview: null,
    };
    expect(session.summary).toBeDefined();
    expect(session.selfReview).toBeNull();
  });

  it('still accepts ReviewSession without Phase 4 fields (backward compat)', () => {
    const session: ReviewSession = {
      prKey: 'gh:o/r#1',
      pr: {
        source: 'github',
        title: 'Test',
        description: '',
        author: 'u',
        baseBranch: 'main',
        headBranch: 'f',
        baseSha: 'b',
        headSha: 'h',
        additions: 0,
        deletions: 0,
        filesChanged: 0,
      },
      diff: { files: [], totalHunks: 0 },
      shikiTokens: {},
      createdAt: '2026-04-20T00:00:00Z',
      headSha: 'h',
      error: null,
      lastEventId: 0,
    };
    expect(session.summary).toBeUndefined();
    expect(session.selfReview).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 8. AppState Phase 4 field extensions
// ---------------------------------------------------------------------------
describe('AppState Phase 4 fields', () => {
  it('has summary, selfReview, and findingsSidebarOpen fields', () => {
    const state: AppState = {
      phase: 'diff',
      session: { active: true },
      launchUrl: 'http://localhost:3000',
      tokenLast4: 'abcd',
      // Phase 4 additions:
      summary: null,
      selfReview: null,
      findingsSidebarOpen: false,
    };
    expect(state.findingsSidebarOpen).toBe(false);
    expect(state.summary).toBeNull();
    expect(state.selfReview).toBeNull();
  });

  it('findingsSidebarOpen is a required boolean (not optional)', () => {
    // This test verifies at compile time that findingsSidebarOpen is required.
    // If it were optional, this would still pass at runtime but the TS compile
    // check in the acceptance criteria enforces the non-optional nature.
    const state: AppState = {
      phase: 'loading',
      session: { active: false },
      launchUrl: '',
      tokenLast4: '',
      findingsSidebarOpen: true,
    };
    expect(typeof state.findingsSidebarOpen).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// 9. Plain-JSON discipline — no Date, no class instances in type shapes
// ---------------------------------------------------------------------------
describe('Plain-JSON discipline', () => {
  it('PrSummary.generatedAt is a string, not a Date', () => {
    const summary: PrSummary = {
      intent: 'chore',
      intentConfidence: 0.5,
      paraphrase: 'test',
      keyChanges: [],
      riskAreas: [],
      generatedAt: new Date().toISOString(), // ISO string, not Date object
    };
    expect(typeof summary.generatedAt).toBe('string');
  });

  it('SelfReview.generatedAt is a string, not a Date', () => {
    const review: SelfReview = {
      findings: [],
      coverage: {
        correctness: 'pass',
        security: 'pass',
        tests: 'pass',
        performance: 'pass',
        style: 'pass',
      },
      verdict: 'approve',
      generatedAt: new Date().toISOString(),
    };
    expect(typeof review.generatedAt).toBe('string');
  });
});
