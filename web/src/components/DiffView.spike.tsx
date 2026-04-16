// SPIKE: verifies @git-diff-view/react@0.1.3 API shape before full DiffView wiring.
// If this file fails to import/render, STOP and per Pitfall 3 switch to react-diff-viewer-continued@4.25.9.
// This file is NOT referenced from production code — it exists solely for the spike test.

// Import defensively — 0.1.3 may export as { DiffView } or default. Try both.
import * as DiffViewLib from '@git-diff-view/react';

const tinyHunks = [
  `@@ -1,1 +1,1 @@
-console.log('a');
+console.log('b');`,
];

// Export everything the library exposes so the test can inspect it.
export const exposed = DiffViewLib;
export const exampleHunks = tinyHunks;

export function DiffViewSpike() {
  // Reach for the most likely component names. The spike test checks what actually renders.
  const Lib = DiffViewLib as Record<string, unknown>;
  const Comp = (Lib.DiffView ?? Lib.default ?? null) as React.ComponentType<Record<string, unknown>> | null;
  if (!Comp) {
    return <div data-testid="spike-no-component">No renderable export found in @git-diff-view/react</div>;
  }
  try {
    // API (from index.d.ts): data: { oldFile?, newFile?, hunks: string[] }
    // hunks is an array of hunk strings (the @@ header + lines)
    return (
      <Comp
        data-testid="spike-rendered"
        data={{
          oldFile: { fileName: 'hello.ts' },
          newFile: { fileName: 'hello.ts' },
          hunks: tinyHunks,
        }}
      />
    );
  } catch {
    return <div data-testid="spike-threw">Library imported but render threw</div>;
  }
}
