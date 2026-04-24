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

const baseProps = {
  pr: basePr,
  ciStatus: undefined as CIStatus | undefined,
  submissionState: null as null,
  activeStep: 'summary' as const,
  onStepClick: () => {},
  onSettingsClick: () => {},
  onSubmitReview: () => {},
};

describe('TopBar (Phase 06.2 two-row header)', () => {
  it('renders PR meta from props (owner/repo, number, title, branches)', () => {
    const { container } = render(<TopBar {...baseProps} />);
    expect(container.textContent).toContain('connorbarr/git-review-plugin');
    expect(container.textContent).toContain('#42');
    expect(container.textContent).toContain('Fix bug');
    expect(container.textContent).toContain('fix/bug');
    expect(container.textContent).toContain('main');
  });

  it('renders two rows: topbar row and stages row', () => {
    const { container } = render(<TopBar {...baseProps} />);
    expect(container.querySelector('.topbar-shell')).toBeTruthy();
    expect(container.querySelector('.topbar')).toBeTruthy();
    expect(container.querySelector('.stages')).toBeTruthy();
  });

  it('renders 4 step items in the step nav', () => {
    const { container } = render(<TopBar {...baseProps} />);
    const stages = container.querySelectorAll('.stage');
    expect(stages.length).toBe(4);
  });

  it('step nav shows correct labels', () => {
    const { container } = render(<TopBar {...baseProps} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Summary');
    expect(text).toContain('Walkthrough');
    expect(text).toContain('Review');
    expect(text).toContain('Submit');
  });

  it('active step circle is highlighted', () => {
    const { container } = render(<TopBar {...baseProps} activeStep="walkthrough" />);
    const stages = container.querySelectorAll('.stage');
    // index 1 = Walkthrough = active
    expect(stages[1].classList.contains('active')).toBe(true);
    expect(stages[0].classList.contains('active')).toBe(false);
  });

  it('CI pill renders when ciStatus is present and aggregate != none', () => {
    const ci: CIStatus = {
      aggregate: 'pass',
      checks: [{ name: 'test', bucket: 'pass', link: 'https://x' }],
    };
    const { container } = render(<TopBar {...baseProps} ciStatus={ci} />);
    expect(container.querySelector('.ci-pill')).toBeTruthy();
  });

  it('CI pill hides entirely when ciStatus is undefined', () => {
    const { container } = render(<TopBar {...baseProps} ciStatus={undefined} />);
    expect(container.querySelector('.ci-pill')).toBeNull();
  });

  it('CI pill hides when aggregate === "none"', () => {
    const { container } = render(
      <TopBar {...baseProps} ciStatus={{ aggregate: 'none', checks: [] }} />
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
    const { container } = render(<TopBar {...baseProps} ciStatus={ci} />);
    const pillBtn = container.querySelector('.ci-pill button') as HTMLElement | null;
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

  it('Settings button fires onSettingsClick', () => {
    const onSet = vi.fn();
    const { container } = render(<TopBar {...baseProps} onSettingsClick={onSet} />);
    const setBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      /settings/i.test(b.textContent ?? '')
    );
    expect(setBtn).toBeTruthy();
    fireEvent.click(setBtn!);
    expect(onSet).toHaveBeenCalled();
  });

  it('Submit review button fires onSubmitReview', () => {
    const onSubmit = vi.fn();
    const { container } = render(<TopBar {...baseProps} onSubmitReview={onSubmit} />);
    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      /submit review/i.test(b.textContent ?? '')
    );
    expect(submitBtn).toBeTruthy();
    fireEvent.click(submitBtn!);
    expect(onSubmit).toHaveBeenCalled();
  });

  it('step click fires onStepClick with correct step key', () => {
    const onStep = vi.fn();
    const { container } = render(<TopBar {...baseProps} onStepClick={onStep} />);
    const stages = container.querySelectorAll('.stage');
    // Click on "Review" step (index 2)
    fireEvent.click(stages[2]);
    expect(onStep).toHaveBeenCalledWith('review');
  });

  it('shows "Review posted" instead of Submit button when submitted', () => {
    const { container } = render(
      <TopBar
        {...baseProps}
        submissionState={{ status: 'submitted' }}
      />
    );
    expect(container.textContent).toContain('Review posted');
    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      /submit review/i.test(b.textContent ?? '')
    );
    expect(submitBtn).toBeUndefined();
  });

  it('CI pill aria-label includes aggregate and check count', () => {
    const ci: CIStatus = {
      aggregate: 'pending',
      checks: [
        { name: 'x', bucket: 'pending', link: '' },
        { name: 'y', bucket: 'pending', link: '' },
      ],
    };
    const { container } = render(<TopBar {...baseProps} ciStatus={ci} />);
    const btn = container.querySelector('.ci-pill-btn') as HTMLElement | null;
    expect(btn?.getAttribute('aria-label')).toMatch(/pending/);
    expect(btn?.getAttribute('aria-label')).toMatch(/2/);
  });

  it('does not render category chips (coverage strip removed per D-09)', () => {
    const { container } = render(<TopBar {...baseProps} />);
    expect(container.querySelector('.stages-coverage-strip')).toBeNull();
  });
});
