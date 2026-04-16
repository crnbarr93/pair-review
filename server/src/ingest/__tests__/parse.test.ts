import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { toDiffModel } from '../parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// From server/src/ingest/__tests__/ → root is 4 levels up
const FIXTURES_DIR = path.resolve(__dirname, '../../../../tests/fixtures');

describe('toDiffModel', () => {
  const ghDiffText = readFileSync(
    path.join(FIXTURES_DIR, 'github-pr.diff'),
    'utf8'
  );

  it('parses github-pr.diff and produces a DiffModel', () => {
    const model = toDiffModel(ghDiffText);
    expect(model).toBeDefined();
    expect(model.files).toBeInstanceOf(Array);
    expect(model.files.length).toBeGreaterThan(0);
  });

  it('every Hunk.id matches /^[0-9a-f]{12}:h\\d+$/', () => {
    const model = toDiffModel(ghDiffText);
    for (const file of model.files) {
      for (const hunk of file.hunks) {
        expect(hunk.id).toMatch(/^[0-9a-f]{12}:h\d+$/);
      }
    }
  });

  it('every DiffLine.id matches /^[0-9a-f]{12}:h\\d+:l\\d+$/', () => {
    const model = toDiffModel(ghDiffText);
    for (const file of model.files) {
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          expect(line.id).toMatch(/^[0-9a-f]{12}:h\d+:l\d+$/);
        }
      }
    }
  });

  it('every DiffLine has fileLine (number) AND diffPosition (number)', () => {
    const model = toDiffModel(ghDiffText);
    for (const file of model.files) {
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          expect(typeof line.fileLine).toBe('number');
          expect(typeof line.diffPosition).toBe('number');
        }
      }
    }
  });

  it('produces stable (deterministic) IDs — same input → identical Hunk.id values', () => {
    const model1 = toDiffModel(ghDiffText);
    const model2 = toDiffModel(ghDiffText);
    const ids1 = model1.files.flatMap((f) => f.hunks.map((h) => h.id));
    const ids2 = model2.files.flatMap((f) => f.hunks.map((h) => h.id));
    expect(ids1).toEqual(ids2);
  });

  it('produces stable (deterministic) DiffLine IDs — same input → identical line IDs', () => {
    const model1 = toDiffModel(ghDiffText);
    const model2 = toDiffModel(ghDiffText);
    const lineIds1 = model1.files.flatMap((f) =>
      f.hunks.flatMap((h) => h.lines.map((l) => l.id))
    );
    const lineIds2 = model2.files.flatMap((f) =>
      f.hunks.flatMap((h) => h.lines.map((l) => l.id))
    );
    expect(lineIds1).toEqual(lineIds2);
  });

  it('totalHunks equals the sum of hunks across all files', () => {
    const model = toDiffModel(ghDiffText);
    const expected = model.files.reduce((s, f) => s + f.hunks.length, 0);
    expect(model.totalHunks).toBe(expected);
  });

  it('classifies added file status', () => {
    const addedDiff = `diff --git a/new.ts b/new.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,3 @@
+export const x = 1;
+export const y = 2;
+export const z = 3;
`;
    const model = toDiffModel(addedDiff);
    expect(model.files[0].status).toBe('added');
  });

  it('classifies deleted file status', () => {
    const deletedDiff = `diff --git a/old.ts b/old.ts
deleted file mode 100644
index abc1234..0000000
--- a/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export const x = 1;
-export const y = 2;
-export const z = 3;
`;
    const model = toDiffModel(deletedDiff);
    expect(model.files[0].status).toBe('deleted');
  });

  it('classifies renamed file status', () => {
    const renamedDiff = `diff --git a/old-name.ts b/new-name.ts
similarity index 90%
rename from old-name.ts
rename to new-name.ts
index abc1234..def5678 100644
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,3 +1,3 @@
-export const x = 1;
+export const x = 2;
 export const y = 2;
 export const z = 3;
`;
    const model = toDiffModel(renamedDiff);
    expect(model.files[0].status).toBe('renamed');
  });

  it('parses local.diff fixture as well', () => {
    const localDiffText = readFileSync(
      path.join(FIXTURES_DIR, 'local.diff'),
      'utf8'
    );
    const model = toDiffModel(localDiffText);
    expect(model.files).toBeInstanceOf(Array);
    expect(model.files.length).toBeGreaterThan(0);
    for (const file of model.files) {
      for (const hunk of file.hunks) {
        expect(hunk.id).toMatch(/^[0-9a-f]{12}:h\d+$/);
      }
    }
  });
});
