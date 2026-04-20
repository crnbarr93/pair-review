import { describe, it, expect } from 'vitest';
import { driveSession } from './harness/drive-session.js';
import { assertCoverageBreadth } from './harness/assertions.js';
import { FIXTURES } from './fixtures/index.js';

describe('Dimension 4 — coverage breadth', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.id}: all 5 coverage keys present + <=1 unjustified pass`, async () => {
      const session = await driveSession(fixture);
      const listResult = await session.callListFiles({ prKey: session.prKey, includeExcluded: true });
      const listResp = JSON.parse(listResult.content[0].text);
      const firstFile = listResp.files[0];
      const hunkResult = await session.callGetHunk({
        prKey: session.prKey,
        hunkId: `${firstFile.fileId}:h0`,
      });
      const hunkResp = JSON.parse(hunkResult.content[0].text);
      const lineId = hunkResp.lines[0].id;

      const result = await session.callRunSelfReview({
        prKey: session.prKey,
        findings: [{
          category: 'correctness',
          checklistItemId: 'c-01',
          severity: 'major',
          lineId,
          title: 'Coverage test finding',
          rationale: 'Ensures correctness category has at least one finding.',
        }],
        coverage: { correctness: 'partial', security: 'partial', tests: 'partial', performance: 'partial', style: 'pass' },
        verdict: 'request_changes',
      });

      expect(result.isError).toBeFalsy();
      const s = session.getSession();
      expect(s?.selfReview).toBeTruthy();
      if (s?.selfReview) {
        assertCoverageBreadth(s.selfReview, 1);
      }
    });
  }

  it('detects unjustified-pass anti-pattern (3 categories pass with 0 findings)', async () => {
    const fixture = FIXTURES[0];
    const session = await driveSession(fixture);

    await session.callRunSelfReview({
      prKey: session.prKey,
      findings: [],
      coverage: { correctness: 'pass', security: 'pass', tests: 'pass', performance: 'pass', style: 'pass' },
      verdict: 'approve',
    });

    const s = session.getSession();
    expect(() => assertCoverageBreadth(s!.selfReview!, 1)).toThrow();
  });
});
