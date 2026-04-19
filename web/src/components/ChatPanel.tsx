// ChatPanel — right-column LLM conversation with progress variants, messages,
// open-threads list, and a fake chat input. Ported from chat.jsx.
import { useRef, useState, type KeyboardEvent } from 'react';
import type {
  BulletIconKind,
  ChatMessageFixture,
  Stage,
  ThreadIndexEntry,
} from '../data';
import { cn, formatMd } from '../utils/highlight';
import { Ic } from './icons';

export type ProgressViz = 'checklist' | 'bar' | 'ring' | 'kanban';

interface ChatPanelProps {
  progressViz: ProgressViz;
  stages: Stage[];
  activeStage: string;
  chat: ChatMessageFixture[];
  threadIndex: ThreadIndexEntry[];
  onOpenThread: (tid: string) => void;
}

export function ChatPanel({
  progressViz,
  stages,
  activeStage,
  chat,
  threadIndex,
  onOpenThread,
}: ChatPanelProps) {
  const doneCount = stages.filter((s) => s.status === 'done').length;
  const total = stages.length;
  const pct = doneCount / total;

  return (
    <div className="chat">
      <div className="chat-head">
        <div className="avatar">C</div>
        <div className="meta">
          <div className="name">Claude</div>
          <div className="status">
            <span className="live" /> Reviewing · claude-sonnet-4.5
          </div>
        </div>
        <button type="button" className="btn-sm">
          <Ic.settings />
        </button>
      </div>

      <ProgressVizView variant={progressViz} stages={stages} activeStage={activeStage} pct={pct} />

      <div className="chat-body">
        {chat.map((m, i) => (
          <ChatMessage key={i} m={m} onOpenThread={onOpenThread} />
        ))}

        <OpenThreadsList threads={threadIndex} onOpenThread={onOpenThread} />

        <div style={{ height: 12 }} />
      </div>

      <ChatInput />
    </div>
  );
}

function ProgressVizView({
  variant,
  stages,
  activeStage,
  pct,
}: {
  variant: ProgressViz;
  stages: Stage[];
  activeStage: string;
  pct: number;
}) {
  if (variant === 'bar') {
    return (
      <div className="chat-progress">
        <div className="row">
          <span className="label">Review progress</span>
          <div className="spacer" />
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
            {stages.filter((s) => s.status === 'done').length}/{stages.length} stages
          </span>
        </div>
        <div className="progress-track">
          {stages.map((s) => (
            <div
              key={s.id}
              className={cn(
                'seg',
                s.status === 'done' && 'done',
                s.id === activeStage && 'active'
              )}
            />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'ring') {
    const r = 14;
    const c = 2 * Math.PI * r;
    return (
      <div className="chat-progress">
        <div className="progress-ring-wrap">
          <svg className="progress-ring" width={36} height={36}>
            <circle className="bg" cx={18} cy={18} r={r} fill="none" strokeWidth={3} />
            <circle
              className="fg"
              cx={18}
              cy={18}
              r={r}
              fill="none"
              strokeWidth={3}
              strokeDasharray={c}
              strokeDashoffset={c * (1 - pct)}
              strokeLinecap="round"
            />
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Correctness pass</div>
            <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>Stage 3 of 5 · 2 open threads</div>
          </div>
        </div>
        <div className="stage-pills">
          {stages.map((s) => (
            <span
              key={s.id}
              className={cn(
                'stage-pill',
                s.status === 'done' && 'done',
                s.id === activeStage && 'active'
              )}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'kanban') {
    const done = stages.filter((s) => s.status === 'done');
    const doing = stages.filter((s) => s.id === activeStage);
    const todo = stages.filter((s) => s.status === 'pending');
    const columns: Array<[string, Stage[], string]> = [
      ['Done', done, 'done'],
      ['Active', doing, 'active'],
      ['Next', todo, 'pending'],
    ];
    return (
      <div className="chat-progress">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {columns.map(([label, list, key]) => (
            <div
              key={key}
              style={{
                background: 'var(--paper)',
                border: '1px solid var(--line)',
                borderRadius: 6,
                padding: 6,
                minHeight: 60,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--ink-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                {label} · {list.length}
              </div>
              {list.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    'stage-pill',
                    key === 'done' && 'done',
                    key === 'active' && 'active'
                  )}
                  style={{ display: 'block', marginBottom: 3, fontSize: 10.5 }}
                >
                  {s.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // checklist default
  return (
    <div className="chat-progress">
      <div className="row">
        <span className="label">Review plan</span>
        <div className="spacer" />
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
          {stages.filter((s) => s.status === 'done').length}/{stages.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {stages.map((s) => {
          const isDone = s.status === 'done';
          const isActive = s.id === activeStage;
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: isDone ? 'var(--claude)' : isActive ? 'var(--ink)' : 'var(--paper)',
                  border: isDone || isActive ? 'none' : '1px solid var(--line-2)',
                  color: '#fff',
                  fontSize: 8,
                }}
              >
                {isDone && <Ic.check />}
                {isActive && (
                  <span
                    style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff' }}
                  />
                )}
              </span>
              <span
                style={{
                  color: isActive ? 'var(--ink)' : isDone ? 'var(--ink-2)' : 'var(--ink-4)',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {s.label}
              </span>
              <div style={{ flex: 1 }} />
              <span
                style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}
              >
                {s.sub}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatMessage({
  m,
  onOpenThread,
}: {
  m: ChatMessageFixture;
  onOpenThread: (tid: string) => void;
}) {
  return (
    <div className="msg">
      <div className={cn('av', m.who === 'claude' ? 'claude' : 'me')}>
        {m.who === 'claude' ? 'C' : 'M'}
      </div>
      <div className="body">
        <span className="who">{m.who === 'claude' ? 'Claude' : 'Maya'}</span>
        <span className="time">{m.time}</span>
        {m.paragraphs &&
          m.paragraphs.map((p, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: formatMd(p) }} />
          ))}
        {m.plan && (
          <div
            style={{
              marginTop: 8,
              border: '1px solid var(--line)',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            {m.plan.map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderTop: i > 0 ? '1px solid var(--line)' : 'none',
                  background: s.status === 'active' ? 'var(--claude-2)' : 'var(--paper)',
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    background:
                      s.status === 'done'
                        ? 'var(--claude)'
                        : s.status === 'active'
                          ? 'var(--ink)'
                          : 'var(--paper)',
                    border: s.status === 'pending' ? '1px solid var(--line-2)' : 'none',
                    color: '#fff',
                    fontSize: 8,
                  }}
                >
                  {s.status === 'done' && <Ic.check />}
                </span>
                <span style={{ fontWeight: s.status === 'active' ? 600 : 500 }}>{s.label}</span>
                {s.note && (
                  <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>— {s.note}</span>
                )}
              </div>
            ))}
          </div>
        )}
        {m.bullets && (
          <ul
            style={{
              margin: '6px 0 0',
              paddingLeft: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {m.bullets.map((b, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  fontSize: 12.5,
                }}
              >
                <BulletIcon kind={b.icon} />
                <span dangerouslySetInnerHTML={{ __html: formatMd(b.text) }} />
              </li>
            ))}
          </ul>
        )}
        {m.threadRef && (
          <div className="thread-ref" onClick={() => onOpenThread(m.threadRef!)}>
            <div className="loc">→ thread at src/middleware/auth.ts:17</div>
            <div className="snippet">Fragile token extraction + no length bound</div>
          </div>
        )}
        {m.chips && (
          <div className="chip-row">
            {m.chips.map((c, i) => (
              <button type="button" key={i} className="chip claude">
                <Ic.sparkle /> {c}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BulletIcon({ kind }: { kind: BulletIconKind }) {
  const map: Record<BulletIconKind, { bg: string; fg: string; ch: string }> = {
    blocker: { bg: 'var(--block-bg)', fg: 'var(--block)', ch: '!' },
    warn: { bg: 'var(--warn-bg)', fg: 'var(--warn)', ch: '!' },
    ok: { bg: 'var(--ok-bg)', fg: 'var(--ok)', ch: '✓' },
    info: { bg: 'var(--paper-2)', fg: 'var(--ink-3)', ch: 'i' },
  };
  const { bg, fg, ch } = map[kind];
  return (
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: bg,
        color: fg,
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--mono)',
        fontSize: 10,
        fontWeight: 700,
        flex: '0 0 16px',
        marginTop: 1,
      }}
    >
      {ch}
    </span>
  );
}

function OpenThreadsList({
  threads,
  onOpenThread,
}: {
  threads: ThreadIndexEntry[];
  onOpenThread: (tid: string) => void;
}) {
  const open = threads.filter((t) => t.status !== 'resolved');
  return (
    <div
      style={{
        marginTop: 4,
        border: '1px solid var(--line)',
        borderRadius: 6,
        background: 'var(--paper-2)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '7px 10px',
          borderBottom: '1px solid var(--line)',
          fontSize: 10.5,
          color: 'var(--ink-4)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>Open threads</span>
        <span style={{ color: 'var(--ink-3)' }}>· {open.length}</span>
      </div>
      {open.map((t) => (
        <div
          key={t.id}
          onClick={() => onOpenThread(t.id)}
          style={{
            padding: '8px 10px',
            borderTop: '1px solid var(--line)',
            cursor: 'pointer',
            background: 'var(--paper)',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--paper)')}
        >
          <BulletIcon
            kind={t.status === 'blocker' ? 'blocker' : t.status === 'warn' ? 'warn' : 'info'}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 500 }}>
              {t.preview}
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: 'var(--ink-4)',
                fontFamily: 'var(--mono)',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {t.file}:{t.line}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatInput() {
  const [val, setVal] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      setVal('');
    }
  }

  return (
    <div className="chat-input">
      <div className="box">
        <textarea
          ref={ref}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask Claude anything, or say 'next' to move on…"
          rows={1}
        />
        <div className="toolrow">
          <button type="button" className="tool">
            <Ic.attach /> Attach
          </button>
          <button type="button" className="tool">
            <Ic.play /> Run check
          </button>
          <div className="spacer" />
          <span
            style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}
          >
            ⌘K for commands
          </span>
          <button type="button" className="send">
            <Ic.send />
          </button>
        </div>
      </div>
    </div>
  );
}
