import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@shared/types';
import { postUserRequest } from '../api';

interface ChatPanelProps {
  messages: ChatMessage[];
  requestQueuePending: number;
  prKey: string;
  hasSelfReview: boolean;
  contextBadge?: string;  // e.g. 'SUMMARY', 'WALKTHROUGH . auth.ts', 'REVIEW . auth.ts . L42'
  suggestionChips?: Array<{ label: string; message: string }>;
}

const DEFAULT_SUGGESTION_CHIPS = [
  { label: 'Explain this change', message: 'Can you explain what this change does?' },
  { label: 'What are the risks?', message: 'What are the main risks with this change?' },
  { label: 'Regenerate walkthrough', message: 'Please regenerate the walkthrough for this PR.' },
];

export function ChatPanel({
  messages,
  requestQueuePending,
  prKey,
  hasSelfReview,
  contextBadge,
  suggestionChips,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const msgCountAtSend = useRef(-1);
  const prevCountRef = useRef(-1);

  useEffect(() => {
    if (!awaitingReply) return;
    if (messages.length <= msgCountAtSend.current) return;
    const newMessages = messages.slice(msgCountAtSend.current);
    if (newMessages.some((m) => m.author === 'llm')) {
      setAwaitingReply(false);
    }
  }, [messages, awaitingReply]);

  const isThinking = awaitingReply || requestQueuePending > 0;

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const countChanged = messages.length !== prevCountRef.current;
    prevCountRef.current = messages.length;
    if (countChanged) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isThinking]);

  const chips = suggestionChips ?? DEFAULT_SUGGESTION_CHIPS;

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !prKey) return;
    setInput('');
    setSendError(null);
    msgCountAtSend.current = messages.length;
    setAwaitingReply(true);
    try {
      await postUserRequest(prKey, { type: 'chat', payload: { message: trimmed } });
    } catch {
      setSendError('Failed to send message. Please retry.');
      setAwaitingReply(false);
    }
  }

  async function handleRunReview() {
    if (!prKey) return;
    try {
      await postUserRequest(prKey, { type: 'run_self_review' });
    } catch {
      setSendError('Failed to run review. Please retry.');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="chat">
      {/* Header */}
      <div className="chat-head">
        <div className="avatar" style={{ background: 'var(--claude)', color: '#fff', width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
          C
        </div>
        <div className="meta" style={{ flex: 1, minWidth: 0 }}>
          <div className="name" style={{ fontWeight: 600, fontSize: 13 }}>Claude</div>
          <div className="status" style={{ fontSize: 11, color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: 5 }}>
            {isThinking ? (
              <>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                Thinking...
              </>
            ) : (
              <>
                <span className="live" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} />
                Listening...
              </>
            )}
          </div>
        </div>
        {requestQueuePending > 0 && (
          <div
            className="queue-badge"
            title={`${requestQueuePending} message(s) queued`}
            style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--claude)', color: '#fff', fontFamily: 'var(--mono)', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {requestQueuePending}
          </div>
        )}
        <button
          type="button"
          className="btn-sm"
          onClick={handleRunReview}
          disabled={isThinking}
          style={{ marginLeft: 4 }}
        >
          {hasSelfReview ? 'Re-review' : 'Request review'}
        </button>
      </div>

      {/* Context badge */}
      {contextBadge && (
        <div style={{ padding: '6px 12px 0' }}>
          <div className="chat-context-badge">{contextBadge}</div>
        </div>
      )}

      {/* Message body */}
      <div
        ref={bodyRef}
        className="chat-body"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.length === 0 ? (
          <div className="chat-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '32px 16px', textAlign: 'center', flex: 1 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', margin: 0 }}>Ask Claude anything</h3>
            <p style={{ fontSize: 11, color: 'var(--ink-4)', margin: 0, maxWidth: 240 }}>
              Review questions, code explanations, or ask Claude to focus on a specific area.
            </p>
            <div className="chip-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
              {chips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="chip"
                  onClick={() => sendMessage(chip.message)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className="msg">
              <div className={`av ${msg.author === 'llm' ? 'claude' : 'me'}`}>
                {msg.author === 'llm' ? 'C' : 'U'}
              </div>
              <div className="body">
                <span className="who">{msg.author === 'llm' ? 'Claude' : 'You'}</span>
                <span className="time">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <p style={{ whiteSpace: 'pre-wrap' }}>{msg.message}</p>
              </div>
            </div>
          ))
        )}
        {isThinking && (
          <div className="msg thinking-indicator">
            <div className="av claude">C</div>
            <div className="body">
              <span className="who">Claude</span>
              <div className="typing-dots">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error toast */}
      {sendError && (
        <div style={{ padding: '6px 16px', fontSize: 11, color: 'var(--block)', background: 'var(--paper-2)', borderTop: '1px solid var(--line)' }}>
          {sendError}
        </div>
      )}

      {/* Input area */}
      <div className="chat-input">
        <div className="box">
          <textarea
            aria-label="Message Claude"
            placeholder="Ask Claude anything, or say 'next' to move on..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <div className="toolrow">
            <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>⌘K for commands</span>
            <span className="spacer" />
            <button
              type="button"
              className="send"
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              aria-label="Send message"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 14l12-6-12-6v5l8 1-8 1z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
