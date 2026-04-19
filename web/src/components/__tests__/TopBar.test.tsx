import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { TopBar } from '../TopBar';
import type { CIStatus, PullRequestMeta } from '@shared/types';

afterEach(() => {
  cleanup();
});

const basePr: PullRequestMeta = {
  source: 'github',
  title: 'Fix bug',
  description: '',
  author: 'connorbarr',
  baseBranch: 'main',
  headBranch: 'fix/bug',
  baseSha: 'b',
  headSha: 'h',
  additions: 10,
  deletions: 2,
  filesChanged: 3,
  number: 42,
  owner: 'connorbarr',
  repo: 'git-review-plugin',
};

describe('TopBar (Phase 3 live-wired)', () => {
  it('renders PR meta from props (owner/repo, number, title, branches)', () => {
    const { container } = render(
      <TopBar
        pr={basePr}
        ciStatus={undefined}
        onSettingsClick={() => {}}
        onRequestChanges={() => {}}
        onApprove={() => {}}
      />
    );
    expect(container.textContent).toContain('connorbarr/git-review-plugin');
    expect(container.textContent).toContain('#42');
    expect(container.textContent).toContain('Fix bug');
    expect(container.textContent).toContain('fix/bug');
    expect(container.textContent).toContain('main');
  });

  it('CI pill renders when ciStatus is present and aggregate != none', () => {
    const ci: CIStatus = {
      aggregate: 'pass',
      checks: [{ name: 'test', bucket: 'pass', link: 'https://x' }],
    };
    const { container } = render(
      <TopBar
        pr={basePr}
        ciStatus={ci}
        onSettingsClick={() => {}}
        onRequestChanges={() => {}}
        onApprove={() => {}}
      />
    );
    expect(container.querySelector('.ci-pill')).toBeTruthy();
  });

  it('CI pill hides entirely when ciStatus is undefined (D-26 local-branch mode)', () => {
    const { container } = render(
      <TopBar
        pr={basePr}
        ciStatus={undefined}
        onSettingsClick={() => {}}
        onRequestChanges={() => {}}
        onApprove={() => {}}
      />
    );
    expect(container.querySelector('.ci-pill')).toBeNull();
  });

  it('CI pill hides when aggregate === "none"', () => {
    const { container } = render(
      <TopBar
        pr={basePr}
        ciStatus={{ aggregate: 'none', checks: [] }}
        onSettingsClick={() => {}}
        onRequestChanges={() => {}}
        onApprove={() => {}}
      />
    );
    expect(container.querySelector('.ci-pill')).toBeNull();
  });

  it('CI pill click-to-expand shows dropdown with check name + rel="noreferrer" links', () => {
    const ci: CIStatus = {
      aggregate: 'fail',
      checks: [
        { name: 'lint', bucket: 'fail', link: 'https://ci.example/lint' },
        { name: 'test', bucket: 'pass', link: 'https://ci.example/test' },
      ],
    };
    const { container } = render(
      <TopBar
        pr={basePr}
        ciStatus={ci}
        onSettingsClick={() => {}}
        onRequestChanges={() => {}}
        onApprove={() => {}}
      />
    );
    const pillBtn = container.querySelector(
      '.ci-pill button'
    ) as HTMLElement | null;
    expect(pillBtn).toBeTruthy();
    fireEvent.click(pillBtn!);
    const text = container.textContent ?? '';
    expect(text).toContain('lint');
    expect(text).toContain('test');
    const links = container.querySelectorAll('.ci-pill a[target="_blank"]');
    expect(links.length).toBeGreaterThanOrEqual(2);
    links.forEach((l) => {
      expect(l.getAttribute('rel')).toContain('noreferrer');
    });
  });

  it('CTA buttons fire their callbacks', () => {
    const onReq = vi.fn();
    const onApp = vi.fn();
    const onSet = vi.fn();
    const { container } = render(
      <TopBar
        pr={basePr}
        ciStatus={undefined}
        onSettingsClick={onSet}
        onRequestChanges={onReq}
        onApprove={onApp}
      />
    );
    const reqBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      /request changes/i.test(b.textContent ?? '')
    );
    const appBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      /approve.*merge/i.test(b.textContent ?? '')
    );
    const setBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      /settings/i.test(b.textContent ?? '')
    );
    expect(reqBtn).toBeTruthy();
    expect(appBtn).toBeTruthy();
    expect(setBtn).toBeTruthy();
    fireEvent.click(reqBtn!);
    expect(onReq).toHaveBeenCalled();
    fireEvent.click(appBtn!);
    expect(onApp).toHaveBeenCalled();
    fireEvent.click(setBtn!);
    expect(onSet).toHaveBeenCalled();
  });

  it('CI pill aria-label includes aggregate and check count', () => {
    const ci: CIStatus = {
      aggregate: 'pending',
      checks: [
        { name: 'x', bucket: 'pending', link: '' },
        { name: 'y', bucket: 'pending', link: '' },
      ],
    };
    const { container } = render(
      <TopBar
        pr={basePr}
        ciStatus={ci}
        onSettingsClick={() => {}}
        onRequestChanges={() => {}}
        onApprove={() => {}}
      />
    );
    const pill = container.querySelector('.ci-pill') as HTMLElement | null;
    expect(pill?.getAttribute('aria-label')).toMatch(/pending/);
    expect(pill?.getAttribute('aria-label')).toMatch(/2/);
  });
});
