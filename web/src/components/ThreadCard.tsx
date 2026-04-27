// ThreadCard — Phase 06.3 restyled thread card (D-06, D-07, D-08).
// SECURITY:
//   - turn.message is LLM-authored — rendered as React text node inside <p> (T-5-05-01).
//     innerHTML is NEVER used for LLM content in this component.
//   - draftBody rendered in <textarea value={localDraft}> — textarea values are always text, never HTML (T-5-05-02)
import { useState, useEffect, useRef } from 'react';
import type { Thread, ResolvedFinding } from '@shared/types';
import { postUserRequest, postSessionEvent } from '../api';

function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

interface ThreadCardProps {
  thread: Thread;
  finding?: ResolvedFinding;   // Associated finding (if thread was generated from a finding)
  onDraftChange: (threadId: string, body: string) => void;
  onCollapse: () => void;
  prKey: string;               // For reply submissions via postUserRequest
}

const VISIBLE_TURNS = 3;

function getSeverityClass(finding?: ResolvedFinding): string {
  if (!finding) return 'tc-header--neutral';
  switch (finding.severity) {
    case 'blocker': return 'tc-header--blocker';
    case 'major':   return 'tc-header--major';
    case 'minor':   return 'tc-header--minor';
    case 'nit':     return 'tc-header--nit';
    default:        return 'tc-header--neutral';
  }
}

export function ThreadCard({ thread, finding, onDraftChange, onCollapse, prKey }: ThreadCardProps) {
  const [showAllTurns, setShowAllTurns] = useState(false);
  const [localDraft, setLocalDraft] = useState(thread.draftBody ?? '');
  const [replyValue, setReplyValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const userHasEdited = useRef(false);

  // Sync localDraft when server updates draftBody, but only if user hasn't manually edited
  useEffect(() => {
    if (thread.draftBody !== undefined && !userHasEdited.current) {
      setLocalDraft(thread.draftBody);
    }
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

  // @claude detection for reply input
  const isReplyClaudeTagged = replyValue.includes('@claude');

  const handleReplySubmit = async () => {
    if (!replyValue.trim() || submitting) return;
    setSubmitting(true);
    try {
      await postUserRequest(prKey, {
        type: 'inline_comment',
        payload: {
          lineId: thread.lineId,
          message: replyValue.trim(),
          isClaudeTagged: isReplyClaudeTagged,
        },
      });
      setReplyValue('');
    } catch {
      // Keep reply input open so user can retry
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleReplySubmit();
    }
  };

  const severityLabel = finding?.severity
    ? finding.severity.toUpperCase()
    : '';

  return (
    <div
      className={cn('thread-panel', thread.resolved && 'thread-panel--resolved')}
      role="region"
      aria-label={`Thread on ${thread.path}:${thread.line}`}
      id={`thread-${thread.threadId}`}
    >
      {/* Severity-colored header bar (D-06) */}
      <div className={cn('tc-header', getSeverityClass(finding))}>
        <span className="tc-header-label">
          {severityLabel && <span className="tc-header-severity">{severityLabel}</span>}
          <span className="tc-header-loc">Line {thread.line}</span>
          {finding?.category && (
            <span className="tc-header-category">{finding.category}</span>
          )}
        </span>
        <button
          type="button"
          className="tc-header-collapse"
          onClick={onCollapse}
          aria-label="Collapse thread"
        >
          ×
        </button>
      </div>

      {/* Validity toggle — shown when thread is tied to a finding */}
      {finding && (
        <div className="tc-validity" onClick={(e) => e.stopPropagation()}>
          <span className="tc-validity-label">IS THIS FINDING VALID?</span>
          <div className="tc-validity-buttons">
            <button
              type="button"
              className={cn('tc-validity-btn', finding.validity === 'valid' && 'tc-validity-btn--active tc-validity-btn--valid')}
              onClick={() => {
                if (prKey) postSessionEvent(prKey, { type: 'finding.validitySet', findingId: finding.id, validity: 'valid' }).catch(() => {});
              }}
            >
              ✓ Valid
            </button>
            <button
              type="button"
              className={cn('tc-validity-btn', finding.validity === 'invalid' && 'tc-validity-btn--active tc-validity-btn--invalid')}
              onClick={() => {
                if (prKey) postSessionEvent(prKey, { type: 'finding.validitySet', findingId: finding.id, validity: 'invalid' }).catch(() => {});
              }}
            >
              × Invalid
            </button>
          </div>
        </div>
      )}

      {/* Pre-existing badge */}
      {thread.preExisting && (
        <div className="tc-preexisting">
          <span className="tc-preexisting-tag">pre-existing</span>
        </div>
      )}

      {/* Older turns expander */}
      {hiddenCount > 0 && !showAllTurns && (
        <button
          type="button"
          className="thread-older-expander"
          onClick={() => setShowAllTurns(true)}
          aria-expanded={false}
        >
          {hiddenCount} earlier message{hiddenCount !== 1 ? 's' : ''}
        </button>
      )}

      {/* Conversation turns */}
      <div className="thread-msgs">
        {visibleTurns.map((turn, i) => (
          <div key={i} className="tc-turn">
            {/* Avatar circle (D-06) */}
            <div className={cn('tc-avatar', turn.author === 'llm' ? 'tc-avatar--claude' : 'tc-avatar--user')}>
              {turn.author === 'llm' ? 'C' : 'Y'}
            </div>
            <div className="tc-turn-content">
              <div className="tc-turn-meta">
                <span className="tc-turn-name">
                  {turn.author === 'llm' ? 'Claude' : 'You'}
                </span>
                <span className="tc-turn-time">
                  {new Date(turn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {/* SECURITY: message is LLM-authored — render as React text node, NEVER innerHTML */}
              <p className="tc-turn-body">{turn.message}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Typing indicator — Claude is preparing a reply */}
      {thread.turns[thread.turns.length - 1]?.author === 'user' &&
        thread.draftBody === undefined &&
        !thread.resolved && (
          <div className="tc-turn tc-typing">
            <div className="tc-avatar tc-avatar--claude">C</div>
            <div className="tc-turn-content">
              <div className="tc-turn-meta">
                <span className="tc-turn-name">Claude</span>
              </div>
              <div className="typing-dots">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}


      {/* Reply input (D-08) — only for unresolved threads */}
      {!thread.resolved && (
        <div className="tc-reply">
          {isReplyClaudeTagged && (
            <div className="tc-reply-claude-chip" role="status">Claude will respond</div>
          )}
          <div className="tc-reply-row">
            <input
              type="text"
              className="tc-reply-input"
              value={replyValue}
              onChange={(e) => setReplyValue(e.target.value)}
              onKeyDown={handleReplyKeyDown}
              placeholder="Reply..."
              aria-label="Reply to thread"
              disabled={submitting}
            />
            <button
              type="button"
              className="tc-reply-btn"
              onClick={handleReplySubmit}
              disabled={!replyValue.trim() || submitting}
            >
              {isReplyClaudeTagged ? 'Ask Claude' : 'Reply'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
