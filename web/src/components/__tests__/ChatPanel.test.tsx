import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { ChatPanel } from '../ChatPanel';
import type { ChatMessage } from '@shared/types';

vi.mock('../../api', () => ({
  postUserRequest: vi.fn().mockResolvedValue({ ok: true, queued: false }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const defaultProps = {
  messages: [] as ChatMessage[],
  requestQueuePending: 0,
  prKey: 'test/repo#1',
  open: true,
  onToggle: vi.fn(),
};

describe('ChatPanel', () => {
  // D-07: open by default
  it('renders empty state heading when open with no messages', () => {
    render(<ChatPanel {...defaultProps} />);
    expect(screen.getByText('Ask Claude anything')).toBeTruthy();
    const body = document.querySelector('[role="log"]');
    expect(body).toBeTruthy();
  });

  // D-07: collapsed state
  it('renders expand button and hides chat body when closed', () => {
    render(<ChatPanel {...defaultProps} open={false} />);
    // Chat body should not be present
    const body = document.querySelector('[role="log"]');
    expect(body).toBeNull();
    // Expand button should be visible
    const expandBtn = screen.getByLabelText('Expand chat');
    expect(expandBtn).toBeTruthy();
  });

  // D-08: message rendering
  it('renders both user and llm messages as text content', () => {
    const messages: ChatMessage[] = [
      { author: 'user', message: 'Hello from user', timestamp: new Date().toISOString() },
      { author: 'llm', message: 'Hello from Claude', timestamp: new Date().toISOString() },
    ];
    const { container } = render(<ChatPanel {...defaultProps} messages={messages} />);
    expect(screen.getByText(/Hello from user/)).toBeTruthy();
    expect(screen.getByText(/Hello from Claude/)).toBeTruthy();
    // SECURITY: no dangerouslySetInnerHTML — check the rendered HTML does not contain that attribute
    expect(container.innerHTML).not.toContain('dangerouslySetInnerHTML');
  });

  // D-08: send interaction via Enter key
  it('calls postUserRequest with chat type when Enter is pressed', async () => {
    const { postUserRequest } = await import('../../api');
    render(<ChatPanel {...defaultProps} />);
    const textarea = screen.getByLabelText('Message Claude');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(postUserRequest).toHaveBeenCalledWith('test/repo#1', {
      type: 'chat',
      payload: { message: 'Hello' },
    });
  });

  // D-08: Shift+Enter does NOT send (newline)
  it('does not call postUserRequest when Shift+Enter is pressed', async () => {
    const { postUserRequest } = await import('../../api');
    render(<ChatPanel {...defaultProps} />);
    const textarea = screen.getByLabelText('Message Claude');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(postUserRequest).not.toHaveBeenCalled();
  });

  // D-11: Run review button
  it('calls postUserRequest with run_self_review when Run review button is clicked', async () => {
    const { postUserRequest } = await import('../../api');
    render(<ChatPanel {...defaultProps} />);
    const runBtn = screen.getByText('Run review');
    fireEvent.click(runBtn);
    expect(postUserRequest).toHaveBeenCalledWith('test/repo#1', { type: 'run_self_review' });
  });

  // Queue badge visibility
  it('shows queue badge when requestQueuePending > 0', () => {
    render(<ChatPanel {...defaultProps} requestQueuePending={2} />);
    const badge = document.querySelector('.queue-badge');
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe('2');
  });

  it('hides queue badge when requestQueuePending is 0', () => {
    render(<ChatPanel {...defaultProps} requestQueuePending={0} />);
    const badge = document.querySelector('.queue-badge');
    expect(badge).toBeNull();
  });

  // aria-live on chat body
  it('has role="log" and aria-live="polite" on chat body', () => {
    render(<ChatPanel {...defaultProps} />);
    const body = document.querySelector('[role="log"]');
    expect(body).toBeTruthy();
    expect(body?.getAttribute('aria-live')).toBe('polite');
  });
});
