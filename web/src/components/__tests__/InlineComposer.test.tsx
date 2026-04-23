import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { InlineComposer } from '../InlineComposer';
import * as api from '../../api';

// Mock the API module
vi.mock('../../api', () => ({
  postUserRequest: vi.fn().mockResolvedValue({ ok: true, queued: false }),
  setReviewToken: vi.fn(),
  adoptSession: vi.fn(),
  openEventStream: vi.fn(),
  postSessionEvent: vi.fn(),
  confirmSubmit: vi.fn(),
  chooseResume: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const defaultProps = {
  lineId: 'line-abc-123',
  lineNumber: 42,
  prKey: 'test/repo#1',
  onClose: vi.fn(),
};

describe('InlineComposer (D-12 and D-13)', () => {
  // D-12 — renders with textarea
  it('renders with a textarea with the correct placeholder and aria-label', () => {
    render(<InlineComposer {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeTruthy();
    expect(textarea.getAttribute('placeholder')).toContain('Leave a comment');
    expect(textarea.getAttribute('aria-label')).toContain('42');
  });

  // D-12 — submit button labeled "Add comment" by default
  it('shows "Add comment" button by default with no @claude chip', () => {
    const { container } = render(<InlineComposer {...defaultProps} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    const addCommentBtn = buttons.find((b) => b.textContent === 'Add comment');
    expect(addCommentBtn).toBeTruthy();
    const chip = container.querySelector('.claude-chip');
    expect(chip).toBeNull();
  });

  // D-13 — @claude detection changes button label
  it('shows "Ask Claude" button and @claude chip when @claude is typed', () => {
    const { container } = render(<InlineComposer {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'What does this do? @claude' } });

    const buttons = Array.from(container.querySelectorAll('button'));
    const askClaudeBtn = buttons.find((b) => b.textContent === 'Ask Claude');
    expect(askClaudeBtn).toBeTruthy();

    const chip = container.querySelector('.claude-chip');
    expect(chip).toBeTruthy();
    expect(chip?.textContent).toContain('@claude will respond');
  });

  // D-13 — @claude tagged submit sends isClaudeTagged: true
  it('calls postUserRequest with isClaudeTagged: true when @claude is in message', () => {
    const { container } = render(<InlineComposer {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '@claude explain this' } });

    const buttons = Array.from(container.querySelectorAll('button'));
    const askClaudeBtn = buttons.find((b) => b.textContent === 'Ask Claude');
    fireEvent.click(askClaudeBtn!);

    expect(api.postUserRequest).toHaveBeenCalledWith(
      'test/repo#1',
      expect.objectContaining({
        type: 'inline_comment',
        payload: expect.objectContaining({
          isClaudeTagged: true,
          message: '@claude explain this',
        }),
      })
    );
  });

  // D-13 — non-tagged submit sends isClaudeTagged: false
  it('calls postUserRequest with isClaudeTagged: false when @claude is NOT in message', () => {
    const { container } = render(<InlineComposer {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'This needs fixing' } });

    const buttons = Array.from(container.querySelectorAll('button'));
    const addCommentBtn = buttons.find((b) => b.textContent === 'Add comment');
    fireEvent.click(addCommentBtn!);

    expect(api.postUserRequest).toHaveBeenCalledWith(
      'test/repo#1',
      expect.objectContaining({
        type: 'inline_comment',
        payload: expect.objectContaining({
          isClaudeTagged: false,
          message: 'This needs fixing',
        }),
      })
    );
  });

  // D-12 — Escape closes
  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<InlineComposer {...defaultProps} onClose={onClose} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // D-12 — Discard button closes
  it('calls onClose when "Discard comment" button is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<InlineComposer {...defaultProps} onClose={onClose} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    const discardBtn = buttons.find((b) => b.textContent === 'Discard comment');
    expect(discardBtn).toBeTruthy();
    fireEvent.click(discardBtn!);
    expect(onClose).toHaveBeenCalled();
  });
});
