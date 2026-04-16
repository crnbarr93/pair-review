// UI-SPEC §<ErrorState>: AlertCircle icon, 2 copy variants, NO retry button.
import { AlertCircle } from 'lucide-react';

type Variant = 'unreachable' | 'fetch-failed';

const COPY: Record<Variant, { heading: string; body: React.ReactNode }> = {
  unreachable: {
    heading: 'Review unavailable',
    body: (
      <>
        The review server is not responding. Reload the page or run{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>/review</code> again in Claude Code.
      </>
    ),
  },
  'fetch-failed': {
    heading: "Couldn't load diff",
    body: (
      <>
        The diff couldn&apos;t be fetched. Check that the PR exists and your{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>gh</code> auth is valid, then run{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>/review</code> again.
      </>
    ),
  },
};

export function ErrorState({ variant }: { variant: Variant }) {
  const { heading, body } = COPY[variant];
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className="flex flex-col items-center gap-[var(--spacing-md)] text-center"
        style={{ maxWidth: 480 }}
      >
        <AlertCircle
          size={24}
          aria-hidden
          data-testid="error-icon"
          style={{ color: 'var(--color-destructive)' }}
        />
        <h2
          className="font-semibold"
          style={{ fontSize: 16, color: 'var(--color-text)' }}
        >
          {heading}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          {body}
        </p>
        {/* NO retry button — UI-SPEC §<ErrorState>: user re-runs /review */}
      </div>
    </div>
  );
}
