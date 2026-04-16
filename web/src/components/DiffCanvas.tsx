// UI-SPEC §<DiffCanvas>: primary visual focal point, 4 states.
import type { AppState } from '@shared/types';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { DiffView } from './DiffView';

export function DiffCanvas({ state }: { state: AppState }) {
  return (
    <main
      className="flex-1 overflow-y-auto"
      style={{
        backgroundColor: 'var(--color-surface)',
        padding: 'var(--spacing-lg) var(--spacing-xl)',
      }}
    >
      {state.phase === 'loading' && <LoadingState />}
      {state.phase === 'empty' && <EmptyState />}
      {state.phase === 'error' && <ErrorState variant={state.errorVariant ?? 'unreachable'} />}
      {state.phase === 'diff' && state.diff && state.shikiTokens && (
        <DiffView model={state.diff} tokens={state.shikiTokens} />
      )}
    </main>
  );
}
