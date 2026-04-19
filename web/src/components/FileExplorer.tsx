// FileExplorer — Phase 3: live-wired to store props per D-10, D-11, D-15.
import type { DiffFile, FileReviewStatus } from '@shared/types';
import { Ic } from './icons';

function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

interface ExplorerProps {
  files: DiffFile[];
  fileReviewStatus: Record<string, FileReviewStatus>;
  activeFileId: string | null;
  onPickFile: (fileId: string) => void;
}

function splitPath(p: string): [string, string] {
  const i = p.lastIndexOf('/');
  return i >= 0 ? [p.slice(0, i), p.slice(i + 1)] : ['', p];
}

function statusFor(
  fileReviewStatus: Record<string, FileReviewStatus>,
  fileId: string
): FileReviewStatus {
  return fileReviewStatus[fileId] ?? 'untouched';
}

export function FileExplorer({
  files,
  fileReviewStatus,
  activeFileId,
  onPickFile,
}: ExplorerProps) {
  const reviewedCount = files.filter(
    (f) => statusFor(fileReviewStatus, f.id) === 'reviewed'
  ).length;
  const inProgressCount = files.filter(
    (f) => statusFor(fileReviewStatus, f.id) === 'in-progress'
  ).length;
  const untouchedCount = files.filter(
    (f) => statusFor(fileReviewStatus, f.id) === 'untouched'
  ).length;

  return (
    <div className="explorer">
      <div className="exp-head">
        <div className="row">
          <div className="exp-title">Files</div>
          <div className="exp-toggle">
            <button type="button" className="on">
              Changed
            </button>
            {/* D-10: Repo tab disabled in Phase 3; Full repo tree arrives in Phase 7. */}
            <button
              type="button"
              disabled
              title="Full repo tree available in Phase 7"
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
            >
              Repo
            </button>
          </div>
        </div>
        <div className="exp-search">
          <Ic.search />
          <input placeholder="Filter changed files…" />
        </div>
      </div>

      <div className="exp-summary">
        <span>
          <span className="dot" style={{ background: 'var(--ok)' }} />{' '}
          {reviewedCount} reviewed
        </span>
        <span>
          <span className="dot" style={{ background: 'var(--warn)' }} />{' '}
          {inProgressCount} in-progress
        </span>
        <span>
          <span
            className="dot"
            style={{ background: 'var(--ink-4)', opacity: 0.4 }}
          />{' '}
          {untouchedCount} untouched
        </span>
      </div>

      <div className="exp-list">
        <div className="exp-group">Changed · {files.length}</div>
        {files.map((f) => (
          <FileNode
            key={f.id}
            file={f}
            reviewStatus={statusFor(fileReviewStatus, f.id)}
            active={activeFileId === f.id}
            onPick={onPickFile}
          />
        ))}
      </div>
    </div>
  );
}

function FileNode({
  file,
  reviewStatus,
  active,
  onPick,
}: {
  file: DiffFile;
  reviewStatus: FileReviewStatus;
  active: boolean;
  onPick: (fileId: string) => void;
}) {
  const [, basename] = splitPath(file.path);
  // D-11 state machine: reviewed → --ok, in-progress → --warn, untouched → --ink-4 0.4.
  const dotColor =
    reviewStatus === 'reviewed'
      ? 'var(--ok)'
      : reviewStatus === 'in-progress'
        ? 'var(--warn)'
        : 'var(--ink-4)';
  const dotOpacity = reviewStatus === 'untouched' ? 0.4 : 1;

  return (
    <div
      className={cn(
        'exp-file',
        active && 'active',
        file.generated && 'excluded'
      )}
      data-file-id={file.id}
      onClick={() => {
        onPick(file.id);
        document
          .getElementById(`diff-${file.id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
      style={file.generated ? { color: 'var(--ink-4)' } : undefined}
    >
      <Ic.file />
      <span className="name">{basename}</span>
      {file.generated && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--ink-4)',
            marginLeft: 'auto',
            marginRight: 6,
          }}
        >
          Excluded
        </span>
      )}
      <span
        className={cn('status', 'dot', reviewStatus)}
        style={{ background: dotColor, opacity: dotOpacity }}
        title={reviewStatus}
      />
    </div>
  );
}
