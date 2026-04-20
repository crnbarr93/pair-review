/**
 * Fixture 01 — Null-pointer bug (genuine correctness defect).
 *
 * BLIND LABEL — expected verdict derived from published rubric sources only.
 * Google eng-practices "Standard of Code Review" — reviewer must catch obvious red flags.
 * Sadowski 2018 — defect-finding is the primary outcome of code reviews.
 */
import type { Fixture } from '../harness/fixture-type.js';

const DIFF_UNIFIED = `diff --git a/src/auth.ts b/src/auth.ts
index abc1234..def5678 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,8 @@ export function verifyToken(token: string): User | null {
   const decoded = jwt.decode(token);
+  // Fix: return early on decode failure
+  const payload = decoded.payload;
   return {
     id: payload.sub,
     email: payload.email,
`;

export const fixture: Fixture = {
  id: '01-null-pointer-bug',
  prTitle: 'Fix null deref in verifyToken',
  prBody:
    'The jwt.decode call returns null on malformed tokens; verifyToken currently dereferences ' +
    '.payload without a guard, which crashes the auth middleware. Add the null check.',
  diffUnified: DIFF_UNIFIED,
  labeledIntent: 'bug-fix',
  expected: {
    verdict: 'request_changes',
    seededDefect: {
      category: 'correctness',
      rationaleMatches: /null|undefined|decoded/i,
    },
  },
  blind: true,
  rubricCitation: 'Google eng-practices — obvious red-flag detection; Sadowski 2018 — defect-finding primary outcome.',
};
