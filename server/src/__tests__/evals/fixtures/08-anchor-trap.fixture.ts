/**
 * Fixture 08 — Anchor trap (deleted file, lineId references non-existent file).
 *
 * NOT BLIND — hand-crafted to test lineId resolution rejection.
 * diffray 2025 phantom-security-finding cascade + Pitfall 2 BLOCKER.
 *
 * Primary purpose: harness synthesizes a finding with a lineId referencing a file
 * that doesn't exist in the diff → handler returns isError (resolveLineId guard).
 */
import type { Fixture } from '../harness/fixture-type.js';

const DIFF_UNIFIED = `diff --git a/src/legacy.ts b/src/legacy.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/legacy.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-export function oldHelper() {
-  return 'legacy';
-}
-
-export const LEGACY_CONST = 42;
diff --git a/src/main.ts b/src/main.ts
index aaa1111..bbb2222 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,5 +1,4 @@
-import { oldHelper } from './legacy';
+const inlinedHelper = () => 'legacy';

-const result = oldHelper();
+const result = inlinedHelper();
 console.log(result);
`;

export const fixture: Fixture = {
  id: '08-anchor-trap',
  prTitle: 'Delete obsolete helpers',
  prBody: 'Removes src/legacy.ts (no longer used) and inlines the one remaining use in src/main.ts.',
  diffUnified: DIFF_UNIFIED,
  labeledIntent: 'chore',
  expected: {
    verdict: 'comment',
  },
  blind: false,
  rubricCitation: 'diffray 2025 phantom-security-finding cascade + Pitfall 2 BLOCKER.',
};
