// UI-SPEC §<DiffView>: thin wrapper around @git-diff-view/react. Unified mode only (D-23).
// This stub is replaced by Task 2's full implementation.
// Pitfall 3/7: isolate the @git-diff-view/react integration to this one file.
import type { DiffModel, ShikiFileTokens } from '@shared/types';
import { DiffView as LibDiffView, DiffModeEnum } from '@git-diff-view/react';

export function DiffView({
  model,
}: {
  model: DiffModel;
  tokens: Record<string, ShikiFileTokens>;
}) {
  if (model.files.length === 0) return null;

  return (
    <div className="flex flex-col gap-[var(--spacing-xl)]">
      {model.files.map((file) => (
        <FileDiff key={file.id} file={file} />
      ))}
    </div>
  );
}

function FileDiff({ file }: { file: DiffModel['files'][number] }) {
  // Build hunks array for @git-diff-view/react. The library's parser
  // (parseInstance.parse) requires a full unified-diff envelope per string —
  // `--- a/<path>` and `+++ b/<path>` headers above the `@@` hunks. Without
  // them, parsing silently produces zero diff lines and the table body stays
  // empty. The 0.1.3 spike test only verified the API exported the right names;
  // it never confirmed actual rendering, which masked the requirement.
  //
  // We pack ALL hunks for one file into a single envelope and pass it as a
  // one-element array. parse-diff stores l.text with the +/-/space prefix
  // already attached, so we use it verbatim (re-prefixing would yield invalid
  // ++/-- lines that the parser also rejects).
  const oldPath = file.oldPath ?? file.path;
  const newPath = file.path;
  const hunkBlocks = file.hunks
    .map((h) => `${h.header}\n${h.lines.map((l) => l.text).join('\n')}`)
    .join('\n');
  const fullDiff = `--- a/${oldPath}\n+++ b/${newPath}\n${hunkBlocks}`;
  const hunks = [fullDiff];

  return (
    <div>
      <div
        className="font-mono"
        style={{
          fontSize: 13,
          color: 'var(--color-text-secondary)',
          marginBottom: 'var(--spacing-sm)',
        }}
      >
        {file.path}
      </div>
      <LibDiffView
        data={{
          oldFile: { fileName: file.oldPath ?? file.path },
          newFile: { fileName: file.path },
          hunks,
        }}
        diffViewMode={DiffModeEnum.Unified}
      />
    </div>
  );
}
