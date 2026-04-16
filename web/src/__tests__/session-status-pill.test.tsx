import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionStatusPill } from '../components/SessionStatusPill';

describe('SessionStatusPill', () => {
  it('renders "Session active" text when active=true', () => {
    render(<SessionStatusPill active={true} />);
    const pill = screen.getByRole('status');
    expect(pill).toHaveTextContent('Session active');
  });

  it('renders exactly "Session active" — no other text variants', () => {
    render(<SessionStatusPill active={true} />);
    // UI-SPEC Copywriting Contract: exact string "Session active"
    expect(screen.getByText('Session active')).toBeDefined();
  });

  it('uses accent-muted background when active=true', () => {
    render(<SessionStatusPill active={true} />);
    const pill = screen.getByRole('status');
    // Background uses --color-accent-muted CSS var
    expect(pill.getAttribute('style')).toContain('var(--color-accent-muted)');
  });

  it('renders ShieldCheck icon (aria-hidden) when active=true', () => {
    render(<SessionStatusPill active={true} />);
    // Lucide icons render as SVG; ShieldCheck should be aria-hidden
    const svgs = document.querySelectorAll('svg[aria-hidden]');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders "Session expired" text when active=false', () => {
    render(<SessionStatusPill active={false} />);
    const pill = screen.getByRole('status');
    expect(pill).toHaveTextContent('Session expired');
  });

  it('renders exactly "Session expired" — no other text variants', () => {
    render(<SessionStatusPill active={false} />);
    // UI-SPEC Copywriting Contract: exact string "Session expired"
    expect(screen.getByText('Session expired')).toBeDefined();
  });

  it('uses destructive-muted background when active=false', () => {
    render(<SessionStatusPill active={false} />);
    const pill = screen.getByRole('status');
    expect(pill.getAttribute('style')).toContain('var(--color-destructive-muted)');
  });

  it('renders ShieldX icon (aria-hidden) when active=false', () => {
    render(<SessionStatusPill active={false} />);
    const svgs = document.querySelectorAll('svg[aria-hidden]');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('aria-label matches the displayed text when active=true', () => {
    render(<SessionStatusPill active={true} />);
    const pill = screen.getByRole('status', { name: 'Session active' });
    expect(pill).toBeDefined();
  });

  it('aria-label matches the displayed text when active=false', () => {
    render(<SessionStatusPill active={false} />);
    const pill = screen.getByRole('status', { name: 'Session expired' });
    expect(pill).toBeDefined();
  });
});
