// UI-SPEC §<AppHeader>: 48px fixed, surface-raised, 1px bottom border, padding 0 lg.
// Note: lucide-react@1.8.0 does not include a Github icon; GitBranch is used for GitHub
// source badge (the text label "#N on owner/repo" provides the GitHub context).
import { GitBranch } from 'lucide-react';
import type { PullRequestMeta } from '@shared/types';
import { SessionStatusPill } from './SessionStatusPill';

export function AppHeader({
  pr,
  sessionActive,
}: {
  pr?: PullRequestMeta;
  sessionActive: boolean;
}) {
  return (
    <header
      className="flex items-center justify-between"
      style={{
        height: 48,
        backgroundColor: 'var(--color-surface-raised)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0 var(--spacing-lg)',
      }}
    >
      <div className="flex items-center gap-[var(--spacing-md)] min-w-0">
        <span
          className="truncate font-semibold"
          style={{ fontSize: 16, color: 'var(--color-text)', maxWidth: '60%' }}
        >
          {pr?.title ?? '—'}
        </span>
        {pr && (
          <span
            className="inline-flex items-center gap-[var(--spacing-xs)] font-semibold"
            style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}
          >
            <GitBranch size={12} aria-hidden />
            {pr.source === 'github' && pr.number
              ? `#${pr.number} on ${pr.owner}/${pr.repo}`
              : `${pr.baseBranch}..${pr.headBranch} (local)`}
          </span>
        )}
      </div>
      <SessionStatusPill active={sessionActive} />
    </header>
  );
}
