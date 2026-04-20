import { expect } from 'vitest';
import type { ReviewSession, SelfReview, ChecklistCategory } from '@shared/types';
import type { ExpectedShape } from './fixture-type.js';

export function assertAnchorsResolve(selfReview: SelfReview, session: ReviewSession): void {
  for (const f of selfReview.findings) {
    const match = /^(.+):h(\d+):l(\d+)$/.exec(f.lineId);
    expect(match, `finding ${f.id} has malformed lineId "${f.lineId}"`).toBeTruthy();
    if (!match) continue;
    const [, fileId, hunkIdxRaw, lineIdxRaw] = match;
    const file = session.diff.files.find((x) => x.id === fileId);
    expect(file, `finding ${f.id}: fileId "${fileId}" not in session`).toBeDefined();
    if (!file) continue;
    const hunk = file.hunks[Number(hunkIdxRaw)];
    expect(hunk, `finding ${f.id}: hunkIdx ${hunkIdxRaw} out of range`).toBeDefined();
    if (!hunk) continue;
    expect(hunk.lines[Number(lineIdxRaw)], `finding ${f.id}: lineIdx ${lineIdxRaw} out of range`).toBeDefined();
  }
}

export function assertVerdictCalibration(selfReview: SelfReview, expected: ExpectedShape): void {
  expect(selfReview.verdict).toBe(expected.verdict);
  if (expected.seededDefect) {
    const defect = expected.seededDefect;
    const hit = selfReview.findings.find((f) =>
      (f.severity === 'blocker' || f.severity === 'major') &&
      f.category === defect.category &&
      defect.rationaleMatches.test(f.rationale)
    );
    expect(hit, `no blocker/major finding matches seeded defect in ${defect.category}`).toBeTruthy();
  } else {
    const blockers = selfReview.findings.filter((f) => f.severity === 'blocker');
    expect(blockers, 'benign fixture produced blocker finding(s)').toHaveLength(0);
  }
}

export function assertCoverageBreadth(selfReview: SelfReview, maxUnjustifiedPasses = 1): void {
  const categories: ChecklistCategory[] = ['correctness', 'security', 'tests', 'performance', 'style'];
  for (const cat of categories) {
    expect(selfReview.coverage[cat], `coverage missing for category "${cat}"`).toBeDefined();
  }
  const unjustified = categories.filter(
    (cat) => selfReview.coverage[cat] === 'pass' && selfReview.findings.every((f) => f.category !== cat)
  );
  expect(
    unjustified.length,
    `too many unjustified passes: ${unjustified.join(', ')}`
  ).toBeLessThanOrEqual(maxUnjustifiedPasses);
}
