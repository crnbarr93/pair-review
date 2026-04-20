import { describe, it, expect } from 'vitest';
import { driveSession } from './harness/drive-session.js';
import { assertAnchorsResolve } from './harness/assertions.js';
import { FIXTURES } from './fixtures/index.js';

describe('Dimension 2 — anchor correctness', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.id}: valid lineIds resolve to real diff lines`, async () => {
      const session = await driveSession(fixture);
      const listResult = await session.callListFiles({ prKey: session.prKey, includeExcluded: true });
      const listResp = JSON.parse(listResult.content[0].text);
      if (listResp.files.length === 0) return;

      const firstFile = listResp.files[0];
      const hunkResult = await session.callGetHunk({
        prKey: session.prKey,
        hunkId: `${firstFile.fileId}:h0`,
      });
      const hunkResp = JSON.parse(hunkResult.content[0].text);
      if (hunkResp.lines.length === 0) return;

      const lineId = hunkResp.lines[0].id;

      const result = await session.callRunSelfReview({
        prKey: session.prKey,
        findings: [{
          category: 'correctness',
          checklistItemId: 'c-01',
          severity: 'major',
          lineId,
          title: 'Test finding',
          rationale: 'Null check missing on decoded payload — could crash at runtime.',
        }],
        coverage: { correctness: 'partial', security: 'pass', tests: 'pass', performance: 'pass', style: 'pass' },
        verdict: 'request_changes',
      });

      expect(result.isError).toBeFalsy();
      const s = session.getSession();
      expect(s?.selfReview).toBeDefined();
      if (s?.selfReview) {
        assertAnchorsResolve(s.selfReview, s);
      }
    });
  }

  it('fixture 08 anchor-trap: fabricated lineId → isError', async () => {
    const fixture = FIXTURES.find((f) => f.id === '08-anchor-trap')!;
    const session = await driveSession(fixture);

    const result = await session.callRunSelfReview({
      prKey: session.prKey,
      findings: [{
        category: 'correctness',
        checklistItemId: 'c-01',
        severity: 'major',
        lineId: 'nonexistent-file:h0:l0',
        title: 'Phantom finding',
        rationale: 'This references a file that does not exist in the diff.',
      }],
      coverage: { correctness: 'fail', security: 'pass', tests: 'pass', performance: 'pass', style: 'pass' },
      verdict: 'request_changes',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toMatch(/lineid|resolve|not found/);
  });
});
