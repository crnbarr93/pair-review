import { describe, it, expect } from 'vitest';
import { toDiffModel } from '../parse.js';

// Minimal unified-diff fixture strings
const DIFF_LOCKFILE = `diff --git a/package-lock.json b/package-lock.json
index abc..def 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,3 +1,3 @@
 line1
-line2
+line2-new
 line3
`;

const DIFF_SRC = `diff --git a/src/app.ts b/src/app.ts
index abc..def 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,3 @@
 const x = 1;
-console.log('old');
+console.log('new');
 export { x };
`;

describe('toDiffModel — generated flag (Phase 3 DIFF-04)', () => {
  it('marks package-lock.json as generated', () => {
    const model = toDiffModel(DIFF_LOCKFILE);
    const file = model.files.find((f) => f.path === 'package-lock.json');
    expect(file).toBeDefined();
    expect(file!.generated).toBe(true);
  });
  it('marks src/app.ts as NOT generated', () => {
    const model = toDiffModel(DIFF_SRC);
    const file = model.files.find((f) => f.path === 'src/app.ts');
    expect(file).toBeDefined();
    expect(file!.generated).toBe(false);
  });
});
