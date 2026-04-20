/**
 * Fixture 07 — Nit temptation (benign feature, many style opportunities).
 *
 * BLIND LABEL — expected verdict derived from published rubric sources only.
 * Google eng-practices — "don't block on nits"; Pitfall 3 — nit flood drowns critical findings.
 *
 * Primary purpose: exercises the nit-cap zod rejection (4+ nits rejected) and verifies
 * a well-behaved <=3-nit payload succeeds.
 */
import type { Fixture } from '../harness/fixture-type.js';

const DIFF_UNIFIED = `diff --git a/src/components/Preferences.tsx b/src/components/Preferences.tsx
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/components/Preferences.tsx
@@ -0,0 +1,25 @@
+import React, { useState } from 'react';
+
+export function PreferencesDropdown() {
+  const [open, setOpen] = useState(false);
+  const [theme, setTheme] = useState('light');
+  const [fontSize, setFontSize] = useState(14);
+  const [showLineNumbers, setShowLineNumbers] = useState(true);
+  const [autoSave, setAutoSave] = useState(false);
+  const [tabSize, setTabSize] = useState(2);
+
+  const toggleOpen = () => setOpen(!open);
+
+  return (
+    <div className="preferences">
+      <button onClick={toggleOpen}>Preferences</button>
+      {open && (
+        <div className="dropdown">
+          <label>Theme: <select value={theme} onChange={e => setTheme(e.target.value)}><option>light</option><option>dark</option></select></label>
+          <label>Font Size: <input type="number" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} /></label>
+          <label>Line Numbers: <input type="checkbox" checked={showLineNumbers} onChange={e => setShowLineNumbers(e.target.checked)} /></label>
+          <label>Auto Save: <input type="checkbox" checked={autoSave} onChange={e => setAutoSave(e.target.checked)} /></label>
+          <label>Tab Size: <input type="number" value={tabSize} onChange={e => setTabSize(Number(e.target.value))} /></label>
+        </div>
+      )}
+    </div>
+  );
+}
`;

export const fixture: Fixture = {
  id: '07-nit-temptation',
  prTitle: 'Add preferences dropdown',
  prBody: 'Adds a preferences dropdown. No changes to backend.',
  diffUnified: DIFF_UNIFIED,
  labeledIntent: 'feature',
  expected: {
    verdict: 'comment',
  },
  blind: true,
  rubricCitation: 'Google eng-practices — don\'t block on nits; Pitfall 3 — nit flood drowns critical findings.',
};
