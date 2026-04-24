// DiffViewer — Phase 3 bespoke renderer (Open Decision 1 resolution D-05).
// Consumes live DiffModel + ShikiFileTokens + ReadOnlyComment[] via typed props from the store.
// Multi-file vertical scroll with per-file/per-hunk anchors (FileExplorer scroll target + n/p keyboard nav).
// SECURITY:
//   - dangerouslySetInnerHTML is used ONLY for tokenToHtml() output (server-produced Shiki tokens). Token content
//     is HTML-escaped via escapeHtml() and color is validated against HEX_COLOR before style interpolation (T-3-01/T-3-01a).
//   - ReadOnlyComment.body renders exclusively through React text nodes — never innerHTML (T-3-03).
//   - Phase 5: ThreadCard message text renders exclusively through React text nodes — never innerHTML (T-5-05-01).
//   - Phase 06.1: InlineComposer user input is plain text submitted via postUserRequest — no innerHTML.
import { Fragment, useState } from 'react';
import type {
  DiffModel,
  DiffFile,
  Hunk,
  DiffLine,
  ShikiFileTokens,
  ShikiToken,
  ReadOnlyComment,
  FileReviewStatus,
  Thread,
  Walkthrough,
  ResolvedFinding,
} from '@shared/types';
import { ThreadCard } from './ThreadCard';
import { InlineComposer } from './InlineComposer';

export type DiffView = 'unified' | 'split';

interface DiffViewerProps {
  diff: DiffModel;
  shikiTokens: Record<string, ShikiFileTokens>;
  view: DiffView;
  onViewChange: (v: DiffView) => void;
  fileReviewStatus: Record<string, FileReviewStatus>;
  expandedGenerated: Set<string>;
  focusedHunkId: string | null;
  readOnlyComments: ReadOnlyComment[];
  onMarkReviewed: (fileId: string) => void;
  onExpandGenerated: (fileId: string, expanded: boolean) => void;
  // Phase 5 additions
  walkthrough?: Walkthrough | null;
  threads?: Record<string, Thread>;
  onDraftChange?: (threadId: string, body: string) => void;
  onSkipStep?: () => void;
  onNextStep?: () => void;
  // Phase 06.1 additions
  prKey: string;
  // Phase 06.2 additions
  findings?: ResolvedFinding[];
}

// ──────────── Shiki token rendering — the single innerHTML path ────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// T-3-01a: Validate color is a well-formed hex code before interpolating into style.
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

function darkenIfTooLight(hex: string): string {
  if (hex.length !== 7) return hex; // only handle #RRGGBB (6-digit hex)
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luminance <= 160) return hex;
  const scale = 160 / luminance;
  const dr = Math.round(r * scale);
  const dg = Math.round(g * scale);
  const db = Math.round(b * scale);
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
}

function tokenToHtml(tokens: ShikiToken[]): string {
  return tokens
    .map((tok) => {
      const styles: string[] = [];
      if (tok.color && HEX_COLOR.test(tok.color)) {
        styles.push(`color:${tok.color.length === 7 ? darkenIfTooLight(tok.color) : tok.color}`);
      }
      if (tok.fontStyle) {
        if (tok.fontStyle & 1) styles.push('font-style:italic');
        if (tok.fontStyle & 2) styles.push('font-weight:bold');
      }
      const safe = escapeHtml(tok.content);
      if (!styles.length) return safe;
      return `<span style="${styles.join(';')}">${safe}</span>`;
    })
    .join('');
}

// Kind-to-class mapping. The prototype CSS keys on `rem` (not `del`) for deletions;
// preserve that CSS contract so visual styling still works end-to-end.
function rowClassName(kind: DiffLine['kind']): string {
  return kind === 'del' ? 'rem' : kind;
}

function splitPath(p: string): [string, string] {
  const i = p.lastIndexOf('/');
  return i >= 0 ? [p.slice(0, i), p.slice(i + 1)] : ['', p];
}

function fileStats(file: DiffFile): { adds: number; dels: number } {
  let adds = 0;
  let dels = 0;
  for (const h of file.hunks) {
    for (const l of h.lines) {
      if (l.kind === 'add') adds++;
      else if (l.kind === 'del') dels++;
    }
  }
  return { adds, dels };
}

// ──────────── Top-level component ────────────

export function DiffViewer(props: DiffViewerProps) {
  const {
    diff,
    shikiTokens,
    view,
    onViewChange,
    fileReviewStatus,
    expandedGenerated,
    focusedHunkId,
    readOnlyComments,
    onMarkReviewed,
    onExpandGenerated,
    walkthrough,
    threads,
    onDraftChange,
    onSkipStep,
    onNextStep,
    prKey,
    findings,
  } = props;

  return (
    <div className="diff-canvas" data-view={view}>
      {diff.files.map((file) => (
        <FileSection
          key={file.id}
          file={file}
          fileTokens={shikiTokens[file.id]}
          view={view}
          onViewChange={onViewChange}
          reviewStatus={fileReviewStatus[file.id] ?? 'untouched'}
          expanded={expandedGenerated.has(file.id)}
          focusedHunkId={focusedHunkId}
          readOnlyComments={readOnlyComments}
          onMarkReviewed={() => onMarkReviewed(file.id)}
          onExpand={(exp: boolean) => onExpandGenerated(file.id, exp)}
          walkthrough={walkthrough}
          threads={threads}
          onDraftChange={onDraftChange}
          onSkipStep={onSkipStep}
          onNextStep={onNextStep}
          prKey={prKey}
          findings={findings?.filter(f => f.path === file.path)}
        />
      ))}
    </div>
  );
}

// ──────────── Per-file section ────────────

interface FileSectionProps {
  file: DiffFile;
  fileTokens: ShikiFileTokens | undefined;
  view: DiffView;
  onViewChange: (v: DiffView) => void;
  reviewStatus: FileReviewStatus;
  expanded: boolean;
  focusedHunkId: string | null;
  readOnlyComments: ReadOnlyComment[];
  onMarkReviewed: () => void;
  onExpand: (expanded: boolean) => void;
  // Phase 5 additions
  walkthrough?: Walkthrough | null;
  threads?: Record<string, Thread>;
  onDraftChange?: (threadId: string, body: string) => void;
  onSkipStep?: () => void;
  onNextStep?: () => void;
  // Phase 06.1 additions
  prKey: string;
  // Phase 06.2 additions
  findings?: ResolvedFinding[];
}

function FileSection({
  file,
  fileTokens,
  view,
  onViewChange,
  reviewStatus,
  expanded,
  focusedHunkId,
  readOnlyComments,
  onMarkReviewed,
  onExpand,
  walkthrough,
  threads,
  onDraftChange,
  onSkipStep,
  onNextStep,
  prKey,
  findings,
}: FileSectionProps) {
  const collapse = file.generated && !expanded;
  const [dirname, basename] = splitPath(file.path);
  const { adds, dels } = fileStats(file);

  return (
    <div
      id={`diff-${file.id}`}
      data-file-id={file.id}
      className="file-section diff"
      data-view={view}
    >
      <div className="diff-head">
        <div className="path">
          {dirname && <span className="sub">{dirname}/</span>}
          <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{basename}</span>
        </div>
        {file.generated && (
          <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 8 }}>Excluded</span>
        )}
        <div className="stats">
          <span className="add">+{adds}</span>
          <span className="rem">−{dels}</span>
        </div>
        <div className="spacer" />
        <div className="viewtoggle">
          <button
            type="button"
            className={view === 'unified' ? 'on' : undefined}
            onClick={() => onViewChange('unified')}
          >
            Unified
          </button>
          <button
            type="button"
            className={view === 'split' ? 'on' : undefined}
            onClick={() => onViewChange('split')}
          >
            Split
          </button>
        </div>
        <button type="button" className="iconbtn" onClick={onMarkReviewed} title="Mark file reviewed">
          {reviewStatus === 'reviewed' ? 'Reviewed ✓' : 'Mark reviewed'}
        </button>
      </div>

      {collapse ? (
        <GeneratedFileStub onExpand={() => onExpand(true)} />
      ) : (
        <div className="diff-body">
          {file.generated && expanded && (
            <div className="generated-banner" style={{ padding: '8px 16px', background: 'var(--paper-2)', color: 'var(--ink-3)', fontSize: 12 }}>
              Generated file — expanded
            </div>
          )}
          {file.hunks.map((hunk, hunkIdx) => {
            const stepIndex = walkthrough?.steps.findIndex(s => s.hunkId === hunk.id) ?? -1;
            const walkthroughStepForHunk = stepIndex >= 0 ? walkthrough!.steps[stepIndex] : undefined;
            return (
              <div
                key={hunk.id}
                id={hunk.id}
                className={[
                  'hunk',
                  focusedHunkId === hunk.id ? 'focused' : '',
                  walkthroughStepForHunk ? 'hunk--curated' : '',
                ].filter(Boolean).join(' ')}
              >
                <div className="hunk-code">
                  <div className="hunk-head">{hunk.header}</div>
                  {view === 'unified' ? (
                    <UnifiedHunk
                      fileId={file.id}
                      hunk={hunk}
                      hunkIdx={hunkIdx}
                      fileTokens={fileTokens}
                      readOnlyComments={readOnlyComments}
                      threads={threads}
                      onDraftChange={onDraftChange}
                      prKey={prKey}
                      findings={findings}
                    />
                  ) : (
                    <SplitHunk
                      fileId={file.id}
                      hunk={hunk}
                      hunkIdx={hunkIdx}
                      fileTokens={fileTokens}
                      readOnlyComments={readOnlyComments}
                      threads={threads}
                      onDraftChange={onDraftChange}
                      prKey={prKey}
                      findings={findings}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────── Unified hunk ────────────

interface HunkProps {
  fileId: string;
  hunk: Hunk;
  hunkIdx: number;
  fileTokens: ShikiFileTokens | undefined;
  readOnlyComments: ReadOnlyComment[];
  threads?: Record<string, Thread>;
  onDraftChange?: (threadId: string, body: string) => void;
  // Phase 06.1 additions
  prKey: string;
  // Phase 06.2 additions
  findings?: ResolvedFinding[];
}

const SEVERITY_COLORS: Record<string, { bg: string; fg: string }> = {
  blocker: { bg: 'var(--block-bg)', fg: 'var(--block)' },
  major: { bg: 'var(--warn-bg)', fg: 'var(--warn)' },
  minor: { bg: 'var(--warn-bg)', fg: 'var(--warn)' },
  nit: { bg: 'var(--paper-3)', fg: 'var(--ink-3)' },
};

function FindingAnnotation({ finding }: { finding: ResolvedFinding }) {
  const colors = SEVERITY_COLORS[finding.severity] ?? SEVERITY_COLORS.nit;
  return (
    <div className="finding-annotation">
      <div className="finding-annotation-header">
        <span className="finding-annotation-severity" style={{ background: colors.bg, color: colors.fg }}>
          {finding.severity === 'nit' ? 'NIT' : finding.severity === 'blocker' ? 'BLOCKER' : 'WARNING'}
        </span>
        <span className="finding-annotation-meta">
          Line {finding.line} · {finding.category}
        </span>
      </div>
      <div className="finding-annotation-author">
        <span className="finding-annotation-avatar">C</span>
        <span className="finding-annotation-name">Claude</span>
        <span className="finding-annotation-time">just now</span>
      </div>
      <div className="finding-annotation-body">{finding.rationale}</div>
    </div>
  );
}

function UnifiedHunk({ hunk, hunkIdx, fileTokens, readOnlyComments, threads, onDraftChange, prKey, findings }: HunkProps) {
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [composerLineId, setComposerLineId] = useState<string | null>(null);

  return (
    <table className="diff-table">
      <tbody>
        {hunk.lines.map((line, lineIdx) => {
          const leftLine =
            line.kind === 'del' || line.kind === 'context' ? String(line.fileLine) : '';
          const rightLine =
            line.kind === 'add' || line.kind === 'context' ? String(line.fileLine) : '';
          const tokens = fileTokens?.[hunkIdx]?.[lineIdx] ?? [{ content: line.text }];
          const markers = readOnlyComments.filter((c) => c.lineId === line.id);
          const lineThreads = Object.values(threads ?? {}).filter(t => t.lineId === line.id);
          return (
            <Fragment key={line.id}>
              <tr
                id={line.id}
                className={rowClassName(line.kind)}
                onMouseEnter={() => setHoveredLineId(line.id)}
                onMouseLeave={() => setHoveredLineId(null)}
              >
                <td className="gutter">
                  <span
                    style={{
                      display: 'inline-block',
                      width: 16,
                      textAlign: 'right',
                      marginRight: 4,
                    }}
                  >
                    {leftLine}
                  </span>
                  <span style={{ display: 'inline-block', width: 16, textAlign: 'right' }}>
                    {rightLine}
                  </span>
                  {markers.map((c) => (
                    <ReadOnlyMarker key={c.id} comment={c} />
                  ))}
                  {hoveredLineId === line.id && lineThreads.length === 0 && composerLineId !== line.id && (
                    <button
                      type="button"
                      className="gutter-add-comment"
                      aria-label={`Start comment on line ${line.fileLine}`}
                      onClick={() => setComposerLineId(line.id)}
                    >
                      +
                    </button>
                  )}
                </td>
                <td
                  className="content"
                  // eslint-disable-next-line react/no-danger -- T-3-01: tokens are server-produced + escaped via tokenToHtml
                  dangerouslySetInnerHTML={{ __html: tokenToHtml(tokens) }}
                />
              </tr>
              {composerLineId === line.id && (
                <tr className="thread-row">
                  <td colSpan={2} style={{ padding: 0 }}>
                    <InlineComposer
                      lineId={line.id}
                      lineNumber={line.fileLine}
                      prKey={prKey}
                      onClose={() => setComposerLineId(null)}
                    />
                  </td>
                </tr>
              )}
              {lineThreads.map(thread => (
                <tr key={thread.threadId} className="thread-row">
                  <td colSpan={2} style={{ padding: 0 }}>
                    <ThreadCard
                      thread={thread}
                      onDraftChange={onDraftChange ?? (() => {})}
                      onCollapse={() => {/* collapse handled by parent state */}}
                    />
                  </td>
                </tr>
              ))}
              {(findings ?? []).filter(f => f.lineId === line.id).map(f => (
                <tr key={`finding-${f.id}`} className="thread-row">
                  <td colSpan={2} style={{ padding: 0 }}>
                    <FindingAnnotation finding={f} />
                  </td>
                </tr>
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// ──────────── Split hunk ────────────

// Pair-emission algorithm: walk hunk.lines and group adjacent del+add pairs into
// left/right columns. Emits <table className="diff-table split"> so the split-mode
// render test's DOM assertion passes (Task 1).
//
// - context  → same line mirrored in both columns
// - del      → left only (right empty)
// - add      → right only (left empty)
// - adjacent del+add run → zip-paired into (del, add) rows; overflow emits one-sided rows

interface SplitCell {
  line: DiffLine | null;
  lineIdx: number | null; // matches fileTokens[hunkIdx][lineIdx]
}

function pairSplitLines(hunk: Hunk): Array<{ left: SplitCell; right: SplitCell }> {
  const out: Array<{ left: SplitCell; right: SplitCell }> = [];
  const lines = hunk.lines;
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.kind === 'context') {
      out.push({ left: { line: l, lineIdx: i }, right: { line: l, lineIdx: i } });
      i++;
      continue;
    }
    if (l.kind === 'del') {
      const delRun: Array<[DiffLine, number]> = [];
      while (i < lines.length && lines[i].kind === 'del') {
        delRun.push([lines[i], i]);
        i++;
      }
      const addRun: Array<[DiffLine, number]> = [];
      while (i < lines.length && lines[i].kind === 'add') {
        addRun.push([lines[i], i]);
        i++;
      }
      const max = Math.max(delRun.length, addRun.length);
      for (let k = 0; k < max; k++) {
        const leftPair = delRun[k];
        const rightPair = addRun[k];
        out.push({
          left: leftPair
            ? { line: leftPair[0], lineIdx: leftPair[1] }
            : { line: null, lineIdx: null },
          right: rightPair
            ? { line: rightPair[0], lineIdx: rightPair[1] }
            : { line: null, lineIdx: null },
        });
      }
      continue;
    }
    if (l.kind === 'add') {
      out.push({
        left: { line: null, lineIdx: null },
        right: { line: l, lineIdx: i },
      });
      i++;
      continue;
    }
    // unreachable (exhaustive kinds)
    i++;
  }
  return out;
}

function SplitHunk({ hunk, hunkIdx, fileTokens, readOnlyComments, threads, onDraftChange, prKey, findings }: HunkProps) {
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [composerLineId, setComposerLineId] = useState<string | null>(null);

  const pairs = pairSplitLines(hunk);
  return (
    <table className="diff-table split" data-view="split">
      <tbody>
        {pairs.map((pair, idx) => {
          const leftTokens =
            pair.left.lineIdx !== null
              ? fileTokens?.[hunkIdx]?.[pair.left.lineIdx] ?? [{ content: pair.left.line!.text }]
              : null;
          const rightTokens =
            pair.right.lineIdx !== null
              ? fileTokens?.[hunkIdx]?.[pair.right.lineIdx] ?? [
                  { content: pair.right.line!.text },
                ]
              : null;

          const leftMarkers = pair.left.line
            ? readOnlyComments.filter((c) => c.lineId === pair.left.line!.id)
            : [];
          const rightMarkers = pair.right.line
            ? readOnlyComments.filter((c) => c.lineId === pair.right.line!.id)
            : [];

          const leftKindClass = pair.left.line ? rowClassName(pair.left.line.kind) : 'empty';
          const rightKindClass = pair.right.line ? rowClassName(pair.right.line.kind) : 'empty';

          // Collect threads for the representative line (prefer right/add side, fallback to left)
          const representativeLineId = pair.right.line?.id ?? pair.left.line?.id;
          const rowThreads = representativeLineId
            ? Object.values(threads ?? {}).filter(t => t.lineId === representativeLineId)
            : [];

          // For the composer: use the representative line id and number
          const composerLine = pair.right.line ?? pair.left.line;

          return (
            <Fragment key={idx}>
              <tr
                id={pair.left.line?.id ?? pair.right.line?.id}
                className="diff-row-split"
                onMouseEnter={() => representativeLineId && setHoveredLineId(representativeLineId)}
                onMouseLeave={() => setHoveredLineId(null)}
              >
                {/* Left side: old line number + content */}
                <td className={`gutter ${leftKindClass}`}>
                  {pair.left.line
                    ? String(pair.left.line.fileLine ?? '')
                    : ''}
                  {leftMarkers.map((c) => (
                    <ReadOnlyMarker key={c.id} comment={c} />
                  ))}
                  {hoveredLineId === representativeLineId && rowThreads.length === 0 && composerLineId !== representativeLineId && composerLine && (
                    <button
                      type="button"
                      className="gutter-add-comment"
                      aria-label={`Start comment on line ${composerLine.fileLine}`}
                      onClick={() => representativeLineId && setComposerLineId(representativeLineId)}
                    >
                      +
                    </button>
                  )}
                </td>
                <td
                  className={`content ${leftKindClass}`}
                  // eslint-disable-next-line react/no-danger -- T-3-01: tokens are server-produced + escaped
                  dangerouslySetInnerHTML={{
                    __html: leftTokens ? tokenToHtml(leftTokens) : '',
                  }}
                />
                {/* Right side: new line number + content */}
                <td className={`gutter ${rightKindClass}`}>
                  {pair.right.line
                    ? String(pair.right.line.fileLine ?? '')
                    : ''}
                  {rightMarkers.map((c) => (
                    <ReadOnlyMarker key={c.id} comment={c} />
                  ))}
                </td>
                <td
                  className={`content ${rightKindClass}`}
                  // eslint-disable-next-line react/no-danger -- T-3-01: tokens are server-produced + escaped
                  dangerouslySetInnerHTML={{
                    __html: rightTokens ? tokenToHtml(rightTokens) : '',
                  }}
                />
              </tr>
              {composerLineId === representativeLineId && composerLine && (
                <tr className="thread-row">
                  <td colSpan={4} style={{ padding: 0 }}>
                    <InlineComposer
                      lineId={composerLine.id}
                      lineNumber={composerLine.fileLine}
                      prKey={prKey}
                      onClose={() => setComposerLineId(null)}
                    />
                  </td>
                </tr>
              )}
              {rowThreads.map(thread => (
                <tr key={thread.threadId} className="thread-row">
                  <td colSpan={4} style={{ padding: 0 }}>
                    <ThreadCard
                      thread={thread}
                      onDraftChange={onDraftChange ?? (() => {})}
                      onCollapse={() => {/* collapse handled by parent state */}}
                    />
                  </td>
                </tr>
              ))}
              {(findings ?? []).filter(f => f.lineId === representativeLineId).map(f => (
                <tr key={`finding-${f.id}`} className="thread-row">
                  <td colSpan={4} style={{ padding: 0 }}>
                    <FindingAnnotation finding={f} />
                  </td>
                </tr>
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// ──────────── Generated-file stub ────────────

function GeneratedFileStub({ onExpand }: { onExpand: () => void }) {
  return (
    <div
      className="diff-body"
      style={{ padding: '12px 16px', color: 'var(--ink-3)' }}
    >
      This file is auto-collapsed as generated/lockfile content. It is excluded from Claude&rsquo;s
      context.{' '}
      <button type="button" onClick={onExpand}>
        Expand
      </button>
    </div>
  );
}

// ──────────── Read-only comment marker + popover (T-3-03 safe) ────────────

function ReadOnlyMarker({ comment }: { comment: ReadOnlyComment }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="thread-marker-wrap"
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <span
        className="thread-marker"
        role="button"
        tabIndex={0}
        aria-label={`Existing comment from ${comment.author}`}
        title="View existing comment"
        style={{
          background: 'var(--paper-3)',
          color: 'var(--ink-3)',
          cursor: 'pointer',
        }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      />
      {open && (
        <div
          className="thread-popover"
          role="dialog"
          aria-label="Existing comment"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 20,
            minWidth: 240,
            background: 'var(--paper)',
            border: '1px solid var(--ink-5)',
            borderRadius: 4,
            padding: 8,
            fontSize: 12,
            color: 'var(--ink)',
          }}
        >
          <header style={{ fontWeight: 500, marginBottom: 4 }}>
            {comment.author} · {comment.createdAt}
          </header>
          {/* SECURITY: body renders as React text node — NEVER innerHTML (T-3-03) */}
          <div className="body" style={{ whiteSpace: 'pre-wrap' }}>
            {comment.body}
          </div>
          <footer style={{ marginTop: 6 }}>
            <a href={comment.htmlUrl} target="_blank" rel="noreferrer">
              View on GitHub ↗
            </a>
          </footer>
        </div>
      )}
    </span>
  );
}
