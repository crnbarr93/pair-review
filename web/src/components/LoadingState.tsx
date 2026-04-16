// UI-SPEC §<LoadingState>: single pulsing skeleton, 80x4px, border-radius 2px, NO spinner, NO text.
export function LoadingState() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        data-testid="skeleton-bar"
        className="animate-pulse"
        style={{
          width: 80,
          height: 4,
          borderRadius: 2,
          backgroundColor: 'var(--color-surface-raised)',
        }}
      />
    </div>
  );
}
