// App.tsx — Phase 3 final 2-column AppShell (D-02).
//
// Layout: TopBar row (44px) over (FileExplorer 280px | DiffViewer 1fr).
// Wires live store data into TopBar + FileExplorer + DiffViewer; mounts StaleDiffModal.
// Owns the single global keydown listener (D-17), IntersectionObserver for auto-in-progress
// (D-11), toast state, and footer hint (D-19).
//
// prKey sourcing: read `state.prKey` directly — NEVER reconstruct from pr.owner/repo/number.
// Plan 03-04 Task 2 populates state.prKey from msg.session.prKey in both onSnapshot and
// onUpdate. Before the first snapshot arrives, state.prKey === '' (INITIAL sentinel) and
// every postSessionEvent call site below early-returns on falsy (T-3-13 mitigation).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiffModel, FileReviewStatus } from '@shared/types';
import { useAppStore } from './store';
import { postSessionEvent } from './api';
import { TopBar } from './components/TopBar';
import { FileExplorer } from './components/FileExplorer';
import { DiffViewer, type DiffView } from './components/DiffViewer';
import { StaleDiffModal } from './components/StaleDiffModal';

type PhaseStatus = 'untouched' | 'in-progress' | 'reviewed';

export default function App() {
  const state = useAppStore();
  const diff: DiffModel | undefined = state.diff;
  // prKey is the single source of truth for user-event POSTs. Read directly
  // from state; do NOT reconstruct from pr.owner/repo/number (reconstruction
  // silently fails for local-branch sessions — see Plan 03-05 threat T-3-13).
  const prKey = state.prKey;

  const [view, setView] = useState<DiffView>('unified');
  const [focusedHunkId, setFocusedHunkId] = useState<string | null>(null);
  const [focusedFileId, setFocusedFileId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const focusedHunkIndex = useRef<number>(-1);

  // Build the cross-file virtual hunk list, excluding generated files (D-18).
  // Recomputed from current diff each render so stale indices always map to
  // the current file set (T-3-11 mitigation).
  const virtualList = useMemo(() => {
    if (!diff) return [];
    return diff.files
      .filter((f) => !f.generated)
      .flatMap((f) => f.hunks.map((h) => ({ fileId: f.id, hunkId: h.id })));
  }, [diff]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const advanceHunk = useCallback(
    (delta: number) => {
      if (virtualList.length === 0) return;
      const current = focusedHunkIndex.current;
      // If stale (index out of bounds for new list), reset to -1
      const safeCurrent = current >= virtualList.length ? -1 : current;
      const wrapping =
        delta > 0
          ? safeCurrent === virtualList.length - 1
          : safeCurrent === 0 || safeCurrent === -1;
      const next =
        safeCurrent === -1
          ? delta > 0
            ? 0
            : virtualList.length - 1
          : (safeCurrent + delta + virtualList.length) % virtualList.length;
      focusedHunkIndex.current = next;
      const { hunkId, fileId } = virtualList[next];
      setFocusedHunkId(hunkId);
      setFocusedFileId(fileId);
      document
        .getElementById(hunkId)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (wrapping) {
        if (delta > 0) {
          showToast('Wrapped to first hunk');
        } else {
          showToast('Wrapped to last hunk');
        }
      }
    },
    [virtualList, showToast]
  );

  const markCurrentFileReviewed = useCallback(() => {
    // prKey is empty ('') until the first snapshot arrives (Plan 03-04 INITIAL).
    // Do NOT reconstruct from pr meta — local-branch sessions lack owner/repo/number.
    if (!prKey) return;
    if (!diff) return;
    const targetFileId =
      focusedFileId ?? diff.files.find((f) => !f.generated)?.id ?? null;
    if (!targetFileId) return;
    const current: PhaseStatus =
      (state.fileReviewStatus?.[targetFileId] as PhaseStatus | undefined) ?? 'untouched';
    const nextStatus: PhaseStatus = current === 'reviewed' ? 'in-progress' : 'reviewed';
    postSessionEvent(prKey, {
      type: 'file.reviewStatusSet',
      fileId: targetFileId,
      status: nextStatus,
    }).catch(() => showToast('Could not mark reviewed. Retry.'));
  }, [prKey, diff, focusedFileId, state.fileReviewStatus, showToast]);

  const handleMarkReviewed = useCallback(
    (fileId: string) => {
      // prKey is empty until the first snapshot arrives (Plan 03-04 INITIAL).
      if (!prKey) return;
      const current: PhaseStatus =
        (state.fileReviewStatus?.[fileId] as PhaseStatus | undefined) ?? 'untouched';
      const nextStatus: PhaseStatus = current === 'reviewed' ? 'in-progress' : 'reviewed';
      postSessionEvent(prKey, {
        type: 'file.reviewStatusSet',
        fileId,
        status: nextStatus,
      }).catch(() => showToast('Could not mark reviewed. Retry.'));
    },
    [prKey, state.fileReviewStatus, showToast]
  );

  const handleExpandGenerated = useCallback(
    (fileId: string, expanded: boolean) => {
      // prKey is empty until the first snapshot arrives (Plan 03-04 INITIAL).
      if (!prKey) return;
      postSessionEvent(prKey, {
        type: 'file.generatedExpandToggled',
        fileId,
        expanded,
      }).catch(() => showToast('Could not update file state. Retrying on reload.'));
    },
    [prKey, showToast]
  );

  const handlePickFile = useCallback((fileId: string) => {
    setFocusedFileId(fileId);
  }, []);

  const handleCTAStub = useCallback(
    (msg: string) => {
      showToast(msg);
    },
    [showToast]
  );

  // Global keydown listener (D-17). One listener, lives at the AppShell root.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Skip when focus is inside a text-editable surface (T-3-09 + UX parity
      // with FileExplorer's filter input).
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        return;
      }
      // Skip modifier-key combos (cmd/ctrl/alt) per D-17.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'n':
          e.preventDefault();
          advanceHunk(+1);
          break;
        case 'p':
          e.preventDefault();
          advanceHunk(-1);
          break;
        case 'r':
          e.preventDefault();
          markCurrentFileReviewed();
          break;
        case 'c':
          e.preventDefault();
          showToast('Comments available in Phase 5');
          break;
        case 'v':
          e.preventDefault();
          showToast('Verdict picker available in Phase 6');
          break;
        case 's':
          e.preventDefault();
          showToast('Submit available in Phase 6');
          break;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [advanceHunk, markCurrentFileReviewed, showToast]);

  // IntersectionObserver for auto-in-progress (D-11).
  // 50% visibility threshold + 500ms debounce. Fires once per file per viewport entry.
  // Observer is reattached whenever the diff changes so the file set stays in sync.
  useEffect(() => {
    if (!diff) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const fileId = el.id.startsWith('diff-')
            ? el.id.slice(5)
            : el.dataset.fileId;
          if (!fileId) continue;
          if (entry.isIntersecting) {
            const t = setTimeout(() => {
              // prKey can be '' during pre-snapshot bootstrap; re-read at fire
              // time so the closure doesn't capture a stale empty value.
              const currentPrKey = state.prKey;
              if (!currentPrKey) return;
              const current: PhaseStatus =
                (state.fileReviewStatus?.[fileId] as PhaseStatus | undefined) ??
                'untouched';
              if (current === 'untouched') {
                postSessionEvent(currentPrKey, {
                  type: 'file.reviewStatusSet',
                  fileId,
                  status: 'in-progress',
                }).catch(() => {
                  /* silent — next snapshot reconciles */
                });
              }
            }, 500);
            timers.set(fileId, t);
          } else {
            const t = timers.get(fileId);
            if (t) {
              clearTimeout(t);
              timers.delete(fileId);
            }
          }
        }
      },
      { threshold: 0.5 }
    );
    // Attach to every non-generated file section. Elements are rendered by
    // DiffViewer with id={`diff-${file.id}`}.
    for (const file of diff.files) {
      if (file.generated) continue;
      const el = document.getElementById(`diff-${file.id}`);
      if (el) observer.observe(el);
    }
    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [diff, state.prKey, state.fileReviewStatus]);

  const expandedGeneratedSet = useMemo(() => {
    const s = new Set<string>();
    const record = state.expandedGeneratedFiles ?? {};
    for (const [k, v] of Object.entries(record)) if (v) s.add(k);
    return s;
  }, [state.expandedGeneratedFiles]);

  return (
    <div className="app">
      {state.pr && (
        <TopBar
          pr={state.pr}
          ciStatus={state.ciStatus}
          onSettingsClick={() => handleCTAStub('Settings coming in Phase 7')}
          onRequestChanges={() => handleCTAStub('Verdict picker available in Phase 6')}
          onApprove={() => handleCTAStub('Submit available in Phase 6')}
        />
      )}
      <main className="main">
        {diff && (
          <>
            <FileExplorer
              files={diff.files}
              fileReviewStatus={
                (state.fileReviewStatus ?? {}) as Record<string, FileReviewStatus>
              }
              activeFileId={focusedFileId}
              onPickFile={handlePickFile}
            />
            <DiffViewer
              diff={diff}
              shikiTokens={state.shikiTokens ?? {}}
              view={view}
              onViewChange={setView}
              fileReviewStatus={
                (state.fileReviewStatus ?? {}) as Record<string, FileReviewStatus>
              }
              expandedGenerated={expandedGeneratedSet}
              focusedHunkId={focusedHunkId}
              readOnlyComments={state.existingComments ?? []}
              onMarkReviewed={handleMarkReviewed}
              onExpandGenerated={handleExpandGenerated}
            />
          </>
        )}
      </main>
      <StaleDiffModal />
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
      <div className="footer-hint" aria-hidden="true">
        <span style={{ color: 'var(--ink-3)' }}>n / p · r</span>
        {' · '}
        <span style={{ color: 'var(--ink-4)' }}>c v s</span>
      </div>
    </div>
  );
}
