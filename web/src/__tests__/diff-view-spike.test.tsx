import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DiffViewSpike, exposed } from '../components/DiffView.spike';

// SPIKE: verifies @git-diff-view/react@0.1.3 API shape before full DiffView wiring.
// If "renders without crashing" fails, switch to react-diff-viewer-continued@4.25.9.

describe('@git-diff-view/react 0.1.3 API probe', () => {
  it('imports without throwing', () => {
    expect(exposed).toBeTruthy();
  });

  it('exports at least one component-shaped value', () => {
    const lib = exposed as Record<string, unknown>;
    const hasComponent =
      typeof lib.DiffView !== 'undefined' ||
      typeof lib.default !== 'undefined';
    expect(hasComponent).toBe(true);
  });

  it('renders without crashing', () => {
    const { container } = render(<DiffViewSpike />);
    expect(container.firstChild).not.toBeNull();
  });
});
