// 4-phase router replacing Plan-05's stub. UI-SPEC §Component Inventory + D-24.
import { useAppStore } from './store';
import { AppShell } from './components/AppShell';
import { AppHeader } from './components/AppHeader';
import { AppFooter } from './components/AppFooter';
import { DiffCanvas } from './components/DiffCanvas';

export default function App() {
  const state = useAppStore();
  return (
    <AppShell>
      <AppHeader pr={state.pr ?? undefined} sessionActive={state.session.active} />
      <DiffCanvas state={state} />
      <AppFooter
        launchUrl={state.launchUrl}
        tokenLast4={state.tokenLast4}
        sessionActive={state.session.active}
      />
    </AppShell>
  );
}
