import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AppFooter } from '../components/AppFooter';

afterEach(() => cleanup());

describe('AppFooter', () => {
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    // navigator.clipboard is a getter-only in happy-dom — use defineProperty
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      get: () => ({ writeText: writeTextMock }),
    });
  });

  it('displays token last4 in "Token: ••••[last4]" format', () => {
    render(<AppFooter launchUrl="http://127.0.0.1:8080/" tokenLast4="ab12" sessionActive={true} />);
    expect(screen.getByText(/Token: ••••ab12/)).toBeDefined();
  });

  it('displays the local URL', () => {
    render(<AppFooter launchUrl="http://127.0.0.1:8080/" tokenLast4="ab12" sessionActive={true} />);
    expect(screen.getByText('http://127.0.0.1:8080/')).toBeDefined();
  });

  it('has "Local URL:" label', () => {
    render(<AppFooter launchUrl="http://127.0.0.1:8080/" tokenLast4="ab12" sessionActive={true} />);
    expect(screen.getByText(/Local URL:/)).toBeDefined();
  });

  it('clicking the URL button calls navigator.clipboard.writeText with the URL', () => {
    render(<AppFooter launchUrl="http://127.0.0.1:8080/" tokenLast4="ab12" sessionActive={true} />);
    const button = screen.getByRole('button');
    button.click();
    expect(writeTextMock).toHaveBeenCalledWith('http://127.0.0.1:8080/');
  });

  it('clicking the URL calls clipboard.writeText with the exact URL string', () => {
    const url = 'http://127.0.0.1:9999/';
    render(<AppFooter launchUrl={url} tokenLast4="zz99" sessionActive={false} />);
    const button = screen.getByRole('button');
    button.click();
    expect(writeTextMock).toHaveBeenCalledWith(url);
  });

  it('renders "—" when launchUrl is empty', () => {
    render(<AppFooter launchUrl="" tokenLast4="0000" sessionActive={false} />);
    expect(screen.getByRole('button')).toHaveTextContent('—');
  });
});
