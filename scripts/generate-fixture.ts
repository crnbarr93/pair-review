// One-off fixture capture. Runs the real Phase-3 ingest pipeline on a live PR
// and writes the DiffModel + ShikiFileTokens to web/src/__tests__/fixtures/.
//
// Usage:
//   pnpm --filter server exec tsx ../scripts/generate-fixture.ts <pr-number-or-url>
//   # Or from repo root (adjust for your pnpm version):
//   pnpm dlx tsx scripts/generate-fixture.ts <pr-number-or-url>
//
// CONSTRAINTS to honor (D-09 + UI-SPEC):
//   5-10 files, 30-50 hunks, >=1 generated file (lockfile), >=1 renamed file,
//   >=1 file with >=5 hunks, mixed languages (ts/js/json/md).
//
// The script warns on constraint violations but still writes the output; fix
// the source PR or hand-edit the fixture to satisfy constraints.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ingestGithub } from '../server/src/ingest/github.js';
import { toDiffModel } from '../server/src/ingest/parse.js';
import { highlightHunks } from '../server/src/highlight/shiki.js';
import type { DiffModel, ShikiFileTokens } from '../shared/types.js';

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: tsx scripts/generate-fixture.ts <pr-number-or-url>');
    process.exit(1);
  }

  // Step 1: ingest (mirrors server/src/session/manager.ts startReview lines 127-128)
  const { meta, diffText } = await ingestGithub(arg);

  // Step 2: parse (mirrors manager.ts line 149)
  const diff: DiffModel = toDiffModel(diffText);

  // Step 3: highlight (mirrors manager.ts lines 172-180) — skip binary files
  const shikiTokens: Record<string, ShikiFileTokens> = {};
  for (const file of diff.files) {
    if (file.binary) continue;
    shikiTokens[file.id] = await highlightHunks(file.path, meta.headRefOid || 'HEAD', file.hunks);
  }

  // Validate constraints (log warnings only — do not fail)
  const files = diff.files.length;
  const hunks = diff.totalHunks;
  const hasGenerated = diff.files.some((f) => f.generated);
  const hasRenamed = diff.files.some((f) => f.status === 'renamed');
  const hasBigHunk = diff.files.some((f) => f.hunks.length >= 5);
  console.error(
    `Captured: files=${files}, hunks=${hunks}, hasGenerated=${hasGenerated}, hasRenamed=${hasRenamed}, hasBigHunk=${hasBigHunk}`
  );
  if (files < 5 || files > 10) console.error(`WARN: files=${files} outside 5-10 range`);
  if (hunks < 30 || hunks > 50) console.error(`WARN: hunks=${hunks} outside 30-50 range`);
  if (!hasGenerated)
    console.error('WARN: no generated file — add a lockfile to PR or synthesize');
  if (!hasRenamed) console.error('WARN: no renamed file — PR must include a rename');
  if (!hasBigHunk) console.error('WARN: no file with >=5 hunks');

  const fixturesDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'web/src/__tests__/fixtures'
  );
  await mkdir(fixturesDir, { recursive: true });
  await writeFile(resolve(fixturesDir, 'diff-model.fixture.json'), JSON.stringify(diff, null, 2));
  await writeFile(
    resolve(fixturesDir, 'shiki-tokens.fixture.json'),
    JSON.stringify(shikiTokens, null, 2)
  );
  console.error('Wrote fixtures to', fixturesDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
