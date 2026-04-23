// InlineComposer — Phase 06.1 inline comment composer with @claude detection.
// SECURITY:
//   - LLM content is never rendered via innerHTML. Textarea only captures user input.
//   - User-authored text is submitted as plain text via postUserRequest payload.
//   - Component renders only standard React elements (text nodes, buttons).
import { useState } from 'react';
import { postUserRequest } from '../api';

interface InlineComposerProps {
  lineId: string;
  lineNumber: number;
  prKey: string;
  onClose: () => void;
}

export function InlineComposer({ lineId, lineNumber, prKey, onClose }: InlineComposerProps) {
  const [value, setValue] = useState('');

  // @claude detection — determines submission path
  const isClaudeTagged = value.includes('@claude');

  const handleSubmit = async () => {
    if (!value.trim() || !prKey) return;
    try {
      await postUserRequest(prKey, {
        type: 'inline_comment',
        payload: {
          lineId,
          message: value.trim(),
          isClaudeTagged,
        },
      });
      onClose();
    } catch {
      // Keep composer open so user can retry — request failed
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="thread-panel"
      style={{
        borderLeft: '3px solid var(--claude)',
        padding: '8px 16px',
        background: 'var(--paper)',
      }}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Leave a comment... (add @claude to get a response)"
        aria-label={`Leave a comment on line ${lineNumber}`}
        autoFocus
        style={{
          width: '100%',
          minHeight: 60,
          resize: 'vertical',
          fontSize: 13,
          fontFamily: 'inherit',
          border: '1px solid var(--line-2)',
          borderRadius: 6,
          padding: 8,
          background: 'var(--paper)',
          boxSizing: 'border-box',
        }}
      />
      <div className="thread-reply-footer">
        {isClaudeTagged && (
          <span className="claude-chip" role="status">
            @claude will respond
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn-sm"
          onClick={onClose}
        >
          Discard comment
        </button>
        <button
          type="button"
          className="btn-sm primary"
          onClick={handleSubmit}
        >
          {isClaudeTagged ? 'Ask Claude' : 'Add comment'}
        </button>
      </div>
    </div>
  );
}
