// DiffViewer — unified + split, with inline threads in the gutter.
// Ported from diff.jsx.
import { THREADS, type DiffHunk, type DiffModelFixture, type DiffRow } from '../data';
import { cn, highlight } from '../utils/highlight';
import { Ic } from './icons';
import { InlineThread } from './InlineThread';

export type DiffView = 'unified' | 'split';
export type ThreadLayout = 'inline' | 'gutter' | 'side';

interface DiffViewerProps {
  diff: DiffModelFixture;
  view: DiffView;
  onViewChange: (v: DiffView) => void;
  openThreadId: string | null;
  onOpenThread: (tid: string) => void;
  onCloseThread: () => void;
  threadLayout: ThreadLayout;
}

export function DiffViewer({
  diff,
  view,
  onViewChange,
  openThreadId,
  onOpenThread,
  onCloseThread,
  threadLayout,
}: DiffViewerProps) {
  return (
    <div className="diff">
      <div className="diff-head">
        <div className="path">
          <Ic.file />
          <span className="sub">src/middleware/</span>
          <span style={{ color: 'var(--ink)', fontWeight: 500 }}>auth.ts</span>
        </div>
        <div className="stats">
          <span className="add">+42</span>
          <span className="rem">−18</span>
        </div>
        <div className="spacer" />
        <div className="viewtoggle">
          <button
            type="button"
            className={cn(view === 'unified' && 'on')}
            onClick={() => onViewChange('unified')}
          >
            Unified
          </button>
          <button
            type="button"
            className={cn(view === 'split' && 'on')}
            onClick={() => onViewChange('split')}
          >
            Split
          </button>
        </div>
        <button type="button" className="iconbtn" title="Mark file reviewed">
          <Ic.check /> Mark reviewed
        </button>
      </div>

      <div className="diff-body">
        {diff.hunks.map((h, i) => (
          <div className="hunk" key={i}>
            <div className="hunk-head">{h.header}</div>
            {view === 'unified' ? (
              <UnifiedHunk
                hunk={h}
                openThreadId={openThreadId}
                onOpenThread={onOpenThread}
                onCloseThread={onCloseThread}
                threadLayout={threadLayout}
              />
            ) : (
              <SplitHunk hunk={h} onOpenThread={onOpenThread} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface UnifiedHunkProps {
  hunk: DiffHunk;
  openThreadId: string | null;
  onOpenThread: (tid: string) => void;
  onCloseThread: () => void;
  threadLayout: ThreadLayout;
}

function UnifiedHunk({
  hunk,
  openThreadId,
  onOpenThread,
  onCloseThread,
  threadLayout,
}: UnifiedHunkProps) {
  const rows: React.ReactNode[] = [];
  hunk.rows.forEach((r, i) => {
    rows.push(
      <tr key={i} className={r.type}>
        <td className="gutter">
          <span style={{ display: 'inline-block', width: 16, textAlign: 'right', marginRight: 4 }}>
            {r.oldN ?? ''}
          </span>
          <span style={{ display: 'inline-block', width: 16, textAlign: 'right' }}>
            {r.newN ?? ''}
          </span>
          {r.threadIds &&
            r.threadIds.map((tid) => {
              const t = THREADS[tid];
              const cls =
                t.status === 'blocker'
                  ? 'blocker'
                  : t.status === 'warn'
                    ? 'warn'
                    : t.status === 'resolved'
                      ? 'resolved'
                      : '';
              return (
                <span
                  key={tid}
                  className={cn('thread-marker', cls)}
                  title="Click to open thread"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenThread(tid);
                  }}
                >
                  {t.messages.length}
                </span>
              );
            })}
        </td>
        <td className="content" dangerouslySetInnerHTML={{ __html: highlight(r.text) }} />
      </tr>
    );
    if (threadLayout === 'inline' && r.threadIds) {
      r.threadIds.forEach((tid) => {
        if (openThreadId === tid) {
          rows.push(
            <tr key={`thread-${tid}`} className="thread-row">
              <td colSpan={2}>
                <InlineThread thread={THREADS[tid]} onClose={onCloseThread} />
              </td>
            </tr>
          );
        }
      });
    }
  });

  return (
    <table className="diff-table">
      <tbody>{rows}</tbody>
    </table>
  );
}

interface SplitPair {
  left: DiffRow | { type: 'empty'; oldN?: null; newN?: null; text?: string; threadIds?: never };
  right: DiffRow | { type: 'empty'; oldN?: null; newN?: null; text?: string; threadIds?: never };
}

function SplitHunk({
  hunk,
  onOpenThread,
}: {
  hunk: DiffHunk;
  onOpenThread: (tid: string) => void;
}) {
  const pairs: SplitPair[] = [];
  let i = 0;
  while (i < hunk.rows.length) {
    const r = hunk.rows[i];
    if (r.type === 'rem') {
      const rems: DiffRow[] = [];
      while (i < hunk.rows.length && hunk.rows[i].type === 'rem') {
        rems.push(hunk.rows[i]);
        i++;
      }
      const adds: DiffRow[] = [];
      while (i < hunk.rows.length && hunk.rows[i].type === 'add') {
        adds.push(hunk.rows[i]);
        i++;
      }
      const max = Math.max(rems.length, adds.length);
      for (let k = 0; k < max; k++) {
        pairs.push({
          left: rems[k] ?? { type: 'empty' },
          right: adds[k] ?? { type: 'empty' },
        });
      }
    } else if (r.type === 'add') {
      pairs.push({ left: { type: 'empty' }, right: r });
      i++;
    } else {
      pairs.push({ left: r, right: r });
      i++;
    }
  }

  return (
    <div className="diff-split">
      <div className="diff-split-col">
        {pairs.map((p, idx) => (
          <div key={`l-${idx}`} className={`diff-split-row ${p.left.type}`}>
            <div className="g">{('oldN' in p.left && p.left.oldN) ?? ''}</div>
            <div
              className="c"
              dangerouslySetInnerHTML={{ __html: highlight(('text' in p.left && p.left.text) || '') }}
            />
          </div>
        ))}
      </div>
      <div className="diff-split-col">
        {pairs.map((p, idx) => {
          const right = p.right;
          const threadIds = 'threadIds' in right ? right.threadIds : undefined;
          return (
            <div key={`r-${idx}`} className={`diff-split-row ${right.type}`}>
              <div className="g">
                {('newN' in right && right.newN) ?? ''}
                {threadIds &&
                  threadIds.map((tid) => {
                    const t = THREADS[tid];
                    const cls =
                      t.status === 'blocker' ? 'blocker' : t.status === 'warn' ? 'warn' : '';
                    return (
                      <span
                        key={tid}
                        className={cn('thread-marker', cls)}
                        style={{ left: -6 }}
                        onClick={() => onOpenThread(tid)}
                      >
                        {t.messages.length}
                      </span>
                    );
                  })}
              </div>
              <div
                className="c"
                dangerouslySetInnerHTML={{
                  __html: highlight(('text' in right && right.text) || ''),
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
