// UI-SPEC §<AppFooter>: 28px fixed, surface-raised, click-to-copy URL.
export function AppFooter({
  launchUrl,
  tokenLast4,
  sessionActive,
}: {
  launchUrl: string;
  tokenLast4: string;
  sessionActive: boolean;
}) {
  const onCopy = () => {
    if (launchUrl && navigator.clipboard) {
      navigator.clipboard.writeText(launchUrl);
    }
  };

  return (
    <footer
      className="flex items-center justify-between font-semibold"
      style={{
        height: 28,
        backgroundColor: 'var(--color-surface-raised)',
        borderTop: '1px solid var(--color-border)',
        padding: '0 var(--spacing-lg)',
        fontSize: 12,
        color: 'var(--color-text-secondary)',
      }}
    >
      <span>Token: ••••{tokenLast4}</span>
      <span className="flex items-center gap-1">
        <span>Local URL:</span>
        <button
          type="button"
          onClick={onCopy}
          className="font-mono"
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: 0,
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}
          title="Click to copy"
        >
          {launchUrl || '—'}
        </button>
        {/* sessionActive indicator deliberately NOT surfaced here — status pill in header is the one source of truth */}
        <span hidden>{sessionActive ? 'active' : 'inactive'}</span>
      </span>
    </footer>
  );
}
