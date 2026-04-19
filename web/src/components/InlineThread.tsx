// InlineThread + SuggestionBlock — ported from diff.jsx.
import type { Suggestion, Thread, ThreadStatus } from '../data';
import { cn, formatMd } from '../utils/highlight';
import { Ic } from './icons';

const STATUS_TAG: Record<ThreadStatus, { cls: string; label: string }> = {
  blocker: { cls: 'blocker', label: 'BLOCKER' },
  warn: { cls: 'warn', label: 'NEEDS ATTENTION' },
  resolved: { cls: 'ok', label: 'RESOLVED' },
  open: { cls: '', label: 'OPEN' },
};

export function InlineThread({ thread, onClose }: { thread: Thread; onClose: () => void }) {
  const statusTag = STATUS_TAG[thread.status];

  return (
    <div className={cn('thread-panel', thread.status)}>
      <div className="ref-loc">
        <span className={`tag ${statusTag.cls}`}>{statusTag.label}</span>
        <span>
          Line {thread.lineNew} · {thread.stage}
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn-sm" onClick={onClose}>
          <Ic.x />
        </button>
      </div>

      <div className="thread-msgs">
        {thread.messages.map((m, i) => (
          <div key={i} className="thread-msg">
            <div className={cn('av', m.who === 'claude' ? 'claude' : 'me')}>
              {m.who === 'claude' ? 'C' : 'M'}
            </div>
            <div className="body">
              <span className="who">{m.who === 'claude' ? 'Claude' : 'Maya'}</span>
              <span className="time">{m.time}</span>
              <div
                style={{ marginTop: 2 }}
                dangerouslySetInnerHTML={{ __html: formatMd(m.text) }}
              />
              {m.suggestion && <SuggestionBlock s={m.suggestion} />}
            </div>
          </div>
        ))}
      </div>

      <div className="thread-reply">
        <input placeholder="Reply…" />
        <button type="button" className="btn-sm">
          Reply
        </button>
      </div>

      <div className="thread-actions">
        <button type="button" className="btn-sm">
          Mark resolved
        </button>
        <button type="button" className="btn-sm">
          Needs work
        </button>
        <button type="button" className="btn-sm danger">
          Block
        </button>
      </div>
    </div>
  );
}

export function SuggestionBlock({ s }: { s: Suggestion }) {
  return (
    <div className="code-suggest">
      <div className="head">
        <span className="pill">SUGGESTED CHANGE</span>
        <span>
          {s.file}:{s.lines}
        </span>
      </div>
      <pre>
        {s.before.split('\n').map((ln, i) => (
          <span key={`b${i}`} className="r">
            {'- ' + ln + '\n'}
          </span>
        ))}
        {s.after.split('\n').map((ln, i) => (
          <span key={`a${i}`} className="a">
            {'+ ' + ln + '\n'}
          </span>
        ))}
      </pre>
      <div className="actions">
        <button type="button" className="btn-sm primary">
          Apply
        </button>
        <button type="button" className="btn-sm">
          Apply &amp; next
        </button>
        <button type="button" className="btn-sm">
          Dismiss
        </button>
      </div>
    </div>
  );
}
