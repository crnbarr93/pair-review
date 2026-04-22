// ThreadCard — Phase 5 inline push-down thread card.
// SECURITY:
//   - turn.message is LLM-authored — rendered as React text node inside <p> (T-5-05-01).
//     innerHTML is NEVER used for LLM content in this component.
//   - draftBody rendered in <textarea value={localDraft}> — textarea values are always text, never HTML (T-5-05-02)
import { useState, useEffect } from 'react';
import type { Thread } from '@shared/types';

function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

interface ThreadCardProps {
  thread: Thread;
  onDraftChange: (threadId: string, body: string) => void;
  onCollapse: () => void;
}

const VISIBLE_TURNS = 3;

export function ThreadCard({ thread, onDraftChange, onCollapse }: ThreadCardProps) {
  const [showAllTurns, setShowAllTurns] = useState(false);
  const [localDraft, setLocalDraft] = useState(thread.draftBody ?? '');

  // Sync localDraft when server sets draftBody for the first time
  useEffect(() => {
    if (thread.draftBody !== undefined && localDraft === '') {
      setLocalDraft(thread.draftBody);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.draftBody]);

  const visibleTurns = showAllTurns
    ? thread.turns
    : thread.turns.slice(-VISIBLE_TURNS);
  const hiddenCount = thread.turns.length - visibleTurns.length;

  const handleDraftBlur = () => {
    if (localDraft !== thread.draftBody) {
      onDraftChange(thread.threadId, localDraft);
    }
  };

  return (
    <div
      className={cn('thread-panel', thread.resolved && 'thread-panel--resolved')}
      role="region"
      aria-label={`Thread on ${thread.path}:${thread.line}`}
      id={`thread-${thread.threadId}`}
      style={{
        borderLeft: `3px solid ${thread.resolved ? 'var(--ok)' : 'var(--claude)'}`,
        padding: '8px 16px',
        background: 'var(--paper)',
      }}
    >
      {/* Location reference */}
      <div
        className="ref-loc"
        style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', marginBottom: 4 }}
      >
        {thread.path}:{thread.line} · {thread.side.toLowerCase()}
        {thread.preExisting && (
          <span className="tag" style={{ marginLeft: 4, fontSize: 10 }}>pre-existing</span>
        )}
        <button
          type="button"
          onClick={onCollapse}
          style={{
            float: 'right',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--ink-4)',
            fontSize: 12,
          }}
          aria-label="Collapse thread"
        >
          Collapse thread
        </button>
      </div>

      {/* Older turns expander */}
      {hiddenCount > 0 && !showAllTurns && (
        <button
          type="button"
          className="thread-older-expander"
          onClick={() => setShowAllTurns(true)}
          aria-expanded={false}
          style={{
            fontSize: 11,
            color: 'var(--ink-4)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 0',
            display: 'block',
          }}
        >
          {hiddenCount} earlier message{hiddenCount !== 1 ? 's' : ''}
        </button>
      )}

      {/* Conversation turns */}
      <div className="thread-msgs">
        {visibleTurns.map((turn, i) => (
          <div key={i} className="thread-msg" style={{ marginBottom: 8 }}>
            <div className={cn('av', turn.author === 'llm' ? 'claude' : 'me')} />
            <div className="body">
              <span className="who" style={{ fontSize: 12, fontWeight: 600 }}>
                {turn.author === 'llm' ? 'Claude' : 'You'}
              </span>
              <span
                className="time"
                style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', marginLeft: 8 }}
              >
                {new Date(turn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {/* SECURITY: message is LLM-authored — render as React text node, NEVER innerHTML */}
              <p style={{ fontSize: 13, lineHeight: 1.5, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                {turn.message}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Draft comment slot — appears after draft_comment MCP call */}
      {thread.draftBody !== undefined && (
        <div className="thread-draft-slot" style={{ marginTop: 8 }}>
          <textarea
            className="thread-draft-input"
            value={localDraft}
            onChange={(e) => setLocalDraft(e.target.value)}
            onBlur={handleDraftBlur}
            aria-label="Draft comment body — edit before posting"
            placeholder="Synthesized comment — edit before posting"
            style={{
              width: '100%',
              minHeight: 60,
              maxHeight: 200,
              resize: 'vertical',
              fontSize: 13,
              lineHeight: 1.45,
              fontFamily: 'inherit',
              border: '1px solid var(--line-2)',
              borderRadius: 6,
              padding: 8,
              background: 'var(--paper)',
            }}
          />
        </div>
      )}

      {/* Thread actions */}
      {!thread.resolved && (
        <div className="thread-actions" style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          {/* Resolve is non-destructive — just local display state per UI-SPEC */}
        </div>
      )}
    </div>
  );
}
