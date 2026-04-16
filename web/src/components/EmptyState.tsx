// UI-SPEC §<EmptyState> + Copywriting Contract (verbatim).
import { GitCompareArrows } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className="flex flex-col items-center gap-[var(--spacing-md)] text-center"
        style={{ maxWidth: 480 }}
      >
        <GitCompareArrows
          size={24}
          aria-hidden
          data-testid="diff-icon"
          style={{ color: 'var(--color-text-secondary)' }}
        />
        <h2
          className="font-semibold"
          style={{ fontSize: 16, color: 'var(--color-text)' }}
        >
          No changes
        </h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          This diff has no changed files. Run{' '}
          <code style={{ fontFamily: 'var(--font-mono)' }}>/review</code> again with a
          different PR or ref range.
        </p>
      </div>
    </div>
  );
}
