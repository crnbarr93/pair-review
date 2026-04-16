import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { DiffViewSpike, exposed } from '../components/DiffView.spike';

// SPIKE: verifies @git-diff-view/react@0.1.3 API shape before full DiffView wiring.
// The library uses canvas.getContext('2d') for text measurement — not available in happy-dom.
// Provide a minimal mock so the render test can run.
beforeAll(() => {
  // happy-dom's canvas lacks getContext — mock it to prevent 'Cannot set properties of null' crash
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function () {
    return {
      font: '',
      measureText: (_text: string) => ({ width: 0 }),
    };
  };
});

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
