/**
 * Fixture 04 — Pure rename refactor (benign, no defects).
 *
 * BLIND LABEL — expected verdict derived from published rubric sources only.
 * Jet Xu 2025 Tier-1 "no observable failure" gate — pure renames have no behavior change.
 */
import type { Fixture } from '../harness/fixture-type.js';

const DIFF_UNIFIED = `diff --git a/src/handlers.ts b/src/handlers.ts
index aaa1111..bbb2222 100644
--- a/src/handlers.ts
+++ b/src/handlers.ts
@@ -5,7 +5,7 @@ import { db } from './db';
-export function legacyHandler(req: Request): Response {
+export function currentHandler(req: Request): Response {
   return db.query(req.params.id);
 }
diff --git a/src/router.ts b/src/router.ts
index ccc3333..ddd4444 100644
--- a/src/router.ts
+++ b/src/router.ts
@@ -10,7 +10,7 @@ import { app } from './app';
-app.get('/api/items', legacyHandler);
+app.get('/api/items', currentHandler);
diff --git a/src/index.ts b/src/index.ts
index eee5555..fff6666 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -3,7 +3,7 @@ import { app } from './app';
-export { legacyHandler } from './handlers';
+export { currentHandler } from './handlers';
`;

export const fixture: Fixture = {
  id: '04-pure-rename-refactor',
  prTitle: 'Rename legacyHandler to currentHandler',
  prBody: 'Pure rename across 3 callsites. No behavior change.',
  diffUnified: DIFF_UNIFIED,
  labeledIntent: 'refactor',
  expected: {
    verdict: 'comment',
  },
  blind: true,
  rubricCitation: 'Jet Xu 2025 Tier-1 — pure renames have no behavior change and no new defect surface.',
};
