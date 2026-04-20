import { describe, it, expect } from 'vitest';
import { driveSession } from './harness/drive-session.js';
import { assertVerdictCalibration } from './harness/assertions.js';
import { FIXTURES } from './fixtures/index.js';

function getFirstLineId(hunkText: string): string {
  const hunkResp = JSON.parse(hunkText);
  return hunkResp.lines[0].id;
}

describe('Dimension 3 — verdict calibration', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.id}: expected verdict = ${fixture.expected.verdict}`, async () => {
      const session = await driveSession(fixture);
      const listResult = await session.callListFiles({ prKey: session.prKey, includeExcluded: true });
      const listResp = JSON.parse(listResult.content[0].text);
      const firstFile = listResp.files[0];
      const hunkResult = await session.callGetHunk({
        prKey: session.prKey,
        hunkId: `${firstFile.fileId}:h0`,
      });
      const lineId = getFirstLineId(hunkResult.content[0].text);

      const findings = fixture.expected.seededDefect
        ? [{
            category: fixture.expected.seededDefect.category,
            checklistItemId: fixture.expected.seededDefect.category === 'security' ? 's-01' : 'c-01',
            severity: 'blocker' as const,
            lineId,
            title: 'Seeded defect caught',
            rationale: 'null check missing on the decoded payload — auth bypass on delete endpoint',
          }]
        : [];

      const result = await session.callRunSelfReview({
        prKey: session.prKey,
        findings,
        coverage: {
          correctness: fixture.expected.seededDefect ? 'fail' : 'pass',
          security: fixture.expected.seededDefect?.category === 'security' ? 'fail' : 'pass',
          tests: 'pass',
          performance: 'pass',
          style: 'pass',
        },
        verdict: fixture.expected.verdict,
      });

      expect(result.isError).toBeFalsy();
      const s = session.getSession();
      expect(s?.selfReview).toBeTruthy();
      if (s?.selfReview) {
        assertVerdictCalibration(s.selfReview, fixture.expected);
      }
    });
  }

  it('catches sycophancy — approve + zero blockers on genuine-bug fixture', async () => {
    const fixture = FIXTURES.find((f) => f.id === '01-null-pointer-bug')!;
    const session = await driveSession(fixture);

    await session.callRunSelfReview({
      prKey: session.prKey,
      findings: [],
      coverage: { correctness: 'pass', security: 'pass', tests: 'pass', performance: 'pass', style: 'pass' },
      verdict: 'approve',
    });

    const s = session.getSession();
    expect(() => assertVerdictCalibration(s!.selfReview!, fixture.expected)).toThrow();
  });

  it('nit cap rejection — 4 nits → isError', async () => {
    const fixture = FIXTURES.find((f) => f.id === '07-nit-temptation')!;
    const session = await driveSession(fixture);
    const listResult = await session.callListFiles({ prKey: session.prKey, includeExcluded: true });
    const listResp = JSON.parse(listResult.content[0].text);
    const hunkResult = await session.callGetHunk({
      prKey: session.prKey,
      hunkId: `${listResp.files[0].fileId}:h0`,
    });
    const lineId = getFirstLineId(hunkResult.content[0].text);

    const makeNit = (i: number) => ({
      category: 'style' as const,
      checklistItemId: 'st-01',
      severity: 'nit' as const,
      lineId,
      title: `nit ${i}`,
      rationale: `nit rationale ${i}`,
    });

    const result = await session.callRunSelfReview({
      prKey: session.prKey,
      findings: [makeNit(1), makeNit(2), makeNit(3), makeNit(4)],
      coverage: { correctness: 'pass', security: 'pass', tests: 'pass', performance: 'pass', style: 'partial' },
      verdict: 'request_changes',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/nit/i);
  });
});
