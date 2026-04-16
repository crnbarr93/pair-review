// UI-SPEC §<SessionStatusPill>: 12px label semibold, rounded-full, two states per table.
import { ShieldCheck, ShieldX } from 'lucide-react';

export function SessionStatusPill({ active }: { active: boolean }) {
  const bg = active ? 'var(--color-accent-muted)' : 'var(--color-destructive-muted)';
  const fg = active ? 'var(--color-accent)' : 'var(--color-destructive)';
  const Icon = active ? ShieldCheck : ShieldX;
  const label = active ? 'Session active' : 'Session expired'; // UI-SPEC Copywriting Contract (verbatim)

  return (
    <span
      role="status"
      aria-label={label}
      className="inline-flex items-center gap-[var(--spacing-xs)] rounded-full font-semibold"
      style={{
        backgroundColor: bg,
        color: fg,
        padding: '4px 8px',
        fontSize: '12px',
        lineHeight: 1.4,
      }}
    >
      <Icon size={12} aria-hidden />
      {label}
    </span>
  );
}
