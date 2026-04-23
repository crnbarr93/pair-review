import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@shared/types';
import { postUserRequest } from '../api';

interface ChatPanelProps {
  messages: ChatMessage[];
  requestQueuePending: number;
  prKey: string;
  open: boolean;
  onToggle: () => void;
}

const SUGGESTION_CHIPS = [
  { label: 'Explain this change', message: 'Can you explain what this change does?' },
  { label: 'What are the risks?', message: 'What are the main risks with this change?' },
  { label: 'Regenerate walkthrough', message: 'Please regenerate the walkthrough for this PR.' },
];

export function ChatPanel({
  messages,
  requestQueuePending,
  prKey,
  open,
  onToggle,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive, only if user is near bottom
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  if (!open) {
    return (
      <div className="chat chat--collapsed" style={{ width: 48 }}>
        <button
          type="button"
          className="chat-expand-btn"
          onClick={onToggle}
          aria-label="Expand chat"
          aria-expanded={false}
          aria-controls="chat-panel"
          style={{
            width: '100%',
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--ink-4)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    );
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !prKey) return;
    setInput('');
    setSendError(null);
    try {
      await postUserRequest(prKey, { type: 'chat', payload: { message: trimmed } });
    } catch {
      setSendError('Failed to send message. Please retry.');
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

  const isThinking = requestQueuePending > 0;

  return (
    <aside className="chat" id="chat-panel">
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
          style={{ marginLeft: 4 }}
        >
          Run review
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse chat"
          aria-expanded={true}
          aria-controls="chat-panel"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: '4px 6px', borderRadius: 4, display: 'flex', alignItems: 'center' }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

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
              {SUGGESTION_CHIPS.map((chip) => (
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
            placeholder="Ask a question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <div className="toolrow">
            <span className="spacer" />
            <button
              type="button"
              className="send"
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              aria-label="Send message"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
