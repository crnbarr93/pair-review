import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SessionStatusPill } from '../components/SessionStatusPill';

afterEach(() => cleanup());

describe('SessionStatusPill', () => {
  it('renders "Session active" text when active=true', () => {
    const { container } = render(<SessionStatusPill active={true} />);
    const pill = container.querySelector('[role="status"]')!;
    expect(pill.textContent).toContain('Session active');
  });

  it('renders exactly "Session active" copy per UI-SPEC Copywriting Contract', () => {
    render(<SessionStatusPill active={true} />);
    expect(screen.getByText('Session active')).toBeDefined();
  });

  it('uses accent-muted background when active=true', () => {
    const { container } = render(<SessionStatusPill active={true} />);
    const pill = container.querySelector('[role="status"]') as HTMLElement;
    expect(pill.getAttribute('style')).toContain('var(--color-accent-muted)');
  });

  it('renders ShieldCheck icon (aria-hidden) when active=true', () => {
    const { container } = render(<SessionStatusPill active={true} />);
    const svgs = container.querySelectorAll('svg[aria-hidden]');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders "Session expired" text when active=false', () => {
    const { container } = render(<SessionStatusPill active={false} />);
    const pill = container.querySelector('[role="status"]')!;
    expect(pill.textContent).toContain('Session expired');
  });

  it('renders exactly "Session expired" copy per UI-SPEC Copywriting Contract', () => {
    render(<SessionStatusPill active={false} />);
    expect(screen.getByText('Session expired')).toBeDefined();
  });

  it('uses destructive-muted background when active=false', () => {
    const { container } = render(<SessionStatusPill active={false} />);
    const pill = container.querySelector('[role="status"]') as HTMLElement;
    expect(pill.getAttribute('style')).toContain('var(--color-destructive-muted)');
  });

  it('renders ShieldX icon (aria-hidden) when active=false', () => {
    const { container } = render(<SessionStatusPill active={false} />);
    const svgs = container.querySelectorAll('svg[aria-hidden]');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('aria-label matches "Session active" when active=true', () => {
    const { container } = render(<SessionStatusPill active={true} />);
    const pill = container.querySelector('[role="status"]') as HTMLElement;
    expect(pill.getAttribute('aria-label')).toBe('Session active');
  });

  it('aria-label matches "Session expired" when active=false', () => {
    const { container } = render(<SessionStatusPill active={false} />);
    const pill = container.querySelector('[role="status"]') as HTMLElement;
    expect(pill.getAttribute('aria-label')).toBe('Session expired');
  });
});
