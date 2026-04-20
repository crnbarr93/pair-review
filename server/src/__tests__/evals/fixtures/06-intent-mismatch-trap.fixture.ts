/**
 * Fixture 06 — Intent mismatch trap (stated refactor, actually adds new endpoint).
 *
 * NOT BLIND — hand-crafted to test intent-mismatch detection.
 * Pitfall 11 (LLM ignores PR description) + Qodo 2026 context-awareness.
 */
import type { Fixture } from '../harness/fixture-type.js';

const DIFF_UNIFIED = `diff --git a/src/api.ts b/src/api.ts
index aaa1111..bbb2222 100644
--- a/src/api.ts
+++ b/src/api.ts
@@ -15,6 +15,14 @@ app.get('/api/items', listItems);
+// NEW: delete endpoint (author claims "just a refactor")
+app.delete('/api/items/:id', (req, res) => {
+  // No auth check — anyone can delete
+  const id = req.params.id;
+  db.delete(id);
+  res.json({ deleted: true });
+});
+
 app.listen(3000);
`;

export const fixture: Fixture = {
  id: '06-intent-mismatch-trap',
  prTitle: 'Refactor: extract delete handler',
  prBody: 'Small refactor. No behavior change — just extracting the delete handler to its own function for readability.',
  diffUnified: DIFF_UNIFIED,
  labeledIntent: 'feature',
  expected: {
    verdict: 'request_changes',
    seededDefect: {
      category: 'security',
      rationaleMatches: /auth|authoriz|endpoint|delete|refactor|behavior.change/i,
    },
    intentMismatchHint: { statedIntent: 'refactor', actualIntent: 'feature', confidenceCeiling: 0.8 },
  },
  blind: false,
  rubricCitation: 'Pitfall 11 + Qodo 2026 context-awareness to PR intent.',
};
