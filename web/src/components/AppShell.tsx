// UI-SPEC §<AppShell>: 3-slot layout, viewport height, main overflow-y auto, bg surface.
import type { PropsWithChildren } from 'react';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="h-screen flex flex-col bg-[color:var(--color-surface)]">{children}</div>
  );
}
