// MINIMAL STUB — Plan 06 replaces this with the full 4-state router
// (DiffCanvas + LoadingState + EmptyState + ErrorState + DiffView).
// Plan 05 ships this stub so main.tsx's render() call doesn't fail to resolve.
import { useAppStore } from './store';
import { AppShell } from './components/AppShell';
import { AppHeader } from './components/AppHeader';
import { AppFooter } from './components/AppFooter';

export default function App() {
  const state = useAppStore();
  return (
    <AppShell>
      <AppHeader pr={state.pr ?? undefined} sessionActive={state.session.active} />
      <main className="flex-1 overflow-y-auto bg-[color:var(--color-surface)]">
        {/* Plan 06: <DiffCanvas state={state} /> */}
        <div className="p-[var(--spacing-lg)] text-[color:var(--color-text-secondary)]">
          Plan 06 mounts the diff canvas here.
        </div>
      </main>
      <AppFooter
        launchUrl={state.launchUrl}
        tokenLast4={state.tokenLast4}
        sessionActive={state.session.active}
      />
    </AppShell>
  );
}
