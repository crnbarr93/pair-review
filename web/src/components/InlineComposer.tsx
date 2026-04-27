// InlineComposer — Phase 06.3 restyled to match ThreadCard visual treatment (D-09).
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
    <div className="ic-panel">
      <textarea
        className="ic-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Leave a comment... (add @claude to get a response)"
        aria-label={`Leave a comment on line ${lineNumber}`}
        autoFocus
      />
      <div className="ic-footer">
        {isClaudeTagged && (
          <span className="ic-claude-chip" role="status">
            @claude will respond
          </span>
        )}
        <span className="ic-footer-spacer" />
        <button
          type="button"
          className="ic-btn-discard"
          onClick={onClose}
        >
          Discard comment
        </button>
        <button
          type="button"
          className="ic-btn-submit"
          onClick={handleSubmit}
        >
          {isClaudeTagged ? 'Ask Claude' : 'Add comment'}
        </button>
      </div>
    </div>
  );
}
