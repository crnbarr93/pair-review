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
  // Build hunks array for the @git-diff-view/react API:
  // data.hunks is string[] where each string is the raw hunk content (header + lines).
  const hunks = file.hunks.map((h) => {
    const lines = h.lines
      .map((l) => {
        const prefix = l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' ';
        return `${prefix}${l.text}`;
      })
      .join('\n');
    return `${h.header}\n${lines}`;
  });

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
