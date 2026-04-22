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
import type { DiffModel, DiffFile, FileReviewStatus, Thread } from '@shared/types';
import { useAppStore, actions } from './store';
import { postSessionEvent } from './api';
import { TopBar, StageStepper } from './components/TopBar';
import { FileExplorer } from './components/FileExplorer';
import { DiffViewer, type DiffView } from './components/DiffViewer';
import { StaleDiffModal } from './components/StaleDiffModal';
import { FindingsSidebar } from './components/FindingsSidebar';
import { SummaryDrawer } from './components/SummaryDrawer';

function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

type PhaseStatus = 'untouched' | 'in-progress' | 'reviewed';

export default function App() {
  const state = useAppStore();
  const diff: DiffModel | undefined = state.diff;
  // prKey is the single source of truth for user-event POSTs. Read directly
  // from state; do NOT reconstruct from pr.owner/repo/number (reconstruction
  // silently fails for local-branch sessions — see Plan 03-05 threat T-3-13).
  const prKey = state.prKey;

  const [summaryDrawerOpen, setSummaryDrawerOpen] = useState(false);
  const [view, setView] = useState<DiffView>('unified');
  const [focusedHunkId, setFocusedHunkId] = useState<string | null>(null);
  const [focusedFileId, setFocusedFileId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const focusedHunkIndex = useRef<number>(-1);

  // Build the cross-file virtual hunk list, excluding generated files (D-18).
  // Walkthrough-aware: in curated mode shows only walkthrough steps in step order (D-05).
  // In show-all mode or when no walkthrough is active, shows all non-generated hunks (D-06).
  // Recomputed from current diff + walkthrough each render so stale indices always map to
  // the current file/step set (T-3-11 mitigation, Threat T-5-05-04: cursor vs virtualList coords kept separate).
  const virtualList = useMemo(() => {
    if (!diff) return [];
    const allHunks = diff.files
      .filter((f) => !f.generated)
      .flatMap((f) => f.hunks.map((h) => ({ fileId: f.id, hunkId: h.id })));

    const walkthrough = state.walkthrough;
    if (walkthrough && !walkthrough.showAll) {
      // Curated mode: only walkthrough steps in step order (D-05)
      return walkthrough.steps.map((step) => {
        const file = diff.files.find((f) => f.hunks.some((h) => h.id === step.hunkId));
        return { fileId: file?.id ?? '', hunkId: step.hunkId };
      });
    }
    // Show-all mode or no walkthrough: all non-generated hunks in file order (D-06)
    return allHunks;
  }, [diff, state.walkthrough]);

  // Compute the DiffModel that DiffViewer renders (Gap 1 closure -- LLM-04).
  // In curated mode (walkthrough active + showAll=false): only hunks listed in
  // walkthrough.steps are passed to DiffViewer; files with no remaining hunks are
  // dropped entirely. Generated files are always excluded from the curated view.
  // In show-all mode or when no walkthrough is active: DiffViewer receives the
  // full diff unchanged. FileExplorer always receives the full diff (file tree).
  const filteredDiff = useMemo((): DiffModel | undefined => {
    if (!diff) return undefined;
    const wt = state.walkthrough;
    // No walkthrough active or show-all mode: render everything
    if (!wt || wt.showAll) return diff;
    // Curated mode: only hunks whose id appears in walkthrough.steps
    const curatedHunkIds = new Set(wt.steps.map(s => s.hunkId));
    const filtered: DiffFile[] = [];
    for (const file of diff.files) {
      // Always skip generated files (excluded from walkthrough narrative)
      if (file.generated) continue;
      const kept = file.hunks.filter(h => curatedHunkIds.has(h.id));
      if (kept.length > 0) {
        filtered.push({ ...file, hunks: kept });
      }
    }
    return { files: filtered, totalHunks: filtered.reduce((n, f) => n + f.hunks.length, 0) };
  }, [diff, state.walkthrough]);

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

  const handleWalkthroughStepClick = useCallback(
    (cursor: number) => {
      if (!prKey) return;
      postSessionEvent(prKey, {
        type: 'walkthrough.stepAdvanced',
        cursor,
      }).catch(() => showToast('Could not advance step. Retry.'));
      // Scroll to the hunk
      const step = state.walkthrough?.steps[cursor];
      if (step) {
        document.getElementById(step.hunkId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setFocusedHunkId(step.hunkId);
        const fileWithHunk = diff?.files.find(f => f.hunks.some(h => h.id === step.hunkId));
        if (fileWithHunk) setFocusedFileId(fileWithHunk.id);
      }
    },
    [prKey, state.walkthrough, diff, showToast]
  );

  const handleShowAllToggle = useCallback(
    (showAll: boolean) => {
      if (!prKey) return;
      postSessionEvent(prKey, {
        type: 'walkthrough.showAllToggled',
        showAll,
      }).catch(() => showToast('Could not toggle view. Retry.'));
      // D-07: toggling back to curated snaps to current walkthrough step
      if (!showAll && state.walkthrough) {
        const currentStep = state.walkthrough.steps[state.walkthrough.cursor];
        if (currentStep) {
          setTimeout(() => {
            document.getElementById(currentStep.hunkId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setFocusedHunkId(currentStep.hunkId);
          }, 100);
        }
      }
    },
    [prKey, state.walkthrough, showToast]
  );

  const handleSkipStep = useCallback(() => {
    if (!prKey || !state.walkthrough) return;
    const nextCursor = Math.min(state.walkthrough.cursor + 1, state.walkthrough.steps.length - 1);
    postSessionEvent(prKey, {
      type: 'walkthrough.stepAdvanced',
      cursor: nextCursor,
    }).catch(() => showToast('Could not skip step. Retry.'));
  }, [prKey, state.walkthrough, showToast]);

  const handleNextStep = useCallback(() => {
    if (!prKey || !state.walkthrough) return;
    const nextCursor = Math.min(state.walkthrough.cursor + 1, state.walkthrough.steps.length - 1);
    postSessionEvent(prKey, {
      type: 'walkthrough.stepAdvanced',
      cursor: nextCursor,
    }).catch(() => showToast('Could not advance step. Retry.'));
    // Scroll to next step
    const nextStep = state.walkthrough.steps[nextCursor];
    if (nextStep) {
      setTimeout(() => {
        document.getElementById(nextStep.hunkId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setFocusedHunkId(nextStep.hunkId);
      }, 100);
    }
  }, [prKey, state.walkthrough, showToast]);

  const handleDraftChange = useCallback(
    (threadId: string, body: string) => {
      actions.updateLocalDraft(threadId, body);
    },
    []
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
          if (focusedHunkId) {
            // Find threads anchored to lines in the focused hunk
            // hunkId format: "<fileId>:h<hunkIdx>", lineId format: "<fileId>:h<hunkIdx>:l<lineIdx>"
            const threadEntries = Object.values(state.threads ?? {}).filter(t => {
              return t.lineId.startsWith(focusedHunkId + ':l');
            });
            if (threadEntries.length > 0) {
              const el = document.getElementById(`thread-${threadEntries[0].threadId}`);
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              showToast('Ask Claude to start a thread on this line');
            }
          } else {
            showToast('Ask Claude to start a thread on this line');
          }
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
    <div className={cn('app', state.findingsSidebarOpen && 'app--findings-open')}>
      {state.pr && (
        <TopBar
          pr={state.pr}
          ciStatus={state.ciStatus}
          summary={state.summary}
          selfReview={state.selfReview}
          activeCategory={state.activeCategory}
          findingsSidebarOpen={state.findingsSidebarOpen}
          onSummaryStep={() => setSummaryDrawerOpen((o) => !o)}
          onSelfReviewStep={() => actions.toggleFindingsSidebar()}
          onCategoryClick={(cat) => actions.setActiveCategory(cat)}
          onToggleFindingsSidebar={() => actions.toggleFindingsSidebar()}
          onSettingsClick={() => handleCTAStub('Settings coming in Phase 7')}
          onRequestChanges={() => handleCTAStub('Verdict picker available in Phase 6')}
          onApprove={() => handleCTAStub('Submit available in Phase 6')}
        />
      )}
      <StageStepper
        summary={state.summary}
        selfReview={state.selfReview}
        activeCategory={state.activeCategory}
        walkthrough={state.walkthrough}
        onSummaryStep={() => setSummaryDrawerOpen((o) => !o)}
        onSelfReviewStep={() => actions.toggleFindingsSidebar()}
        onCategoryClick={(cat) => actions.setActiveCategory(cat)}
        onWalkthroughStepClick={handleWalkthroughStepClick}
        onShowAllToggle={handleShowAllToggle}
      />
      {state.summary && summaryDrawerOpen && (
        <SummaryDrawer
          summary={state.summary}
          authorDescription={state.pr?.description}
          open={summaryDrawerOpen}
          onClose={() => setSummaryDrawerOpen(false)}
        />
      )}
      <main className={cn('main', state.findingsSidebarOpen && 'main--findings-open')}>
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
            {/* filteredDiff: curated hunk subset in walkthrough mode (Gap 1 closure) */}
            <DiffViewer
              diff={filteredDiff ?? diff}
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
              walkthrough={state.walkthrough}
              threads={state.threads}
              onDraftChange={handleDraftChange}
              onSkipStep={handleSkipStep}
              onNextStep={handleNextStep}
            />
            <FindingsSidebar
              selfReview={state.selfReview}
              open={state.findingsSidebarOpen}
              onClose={() => actions.toggleFindingsSidebar()}
              activeCategory={state.activeCategory}
              onCategoryClick={(cat) => actions.setActiveCategory(cat)}
              onFindingClick={(lineId) => {
                const el = document.getElementById(lineId)
                  ?? document.getElementById(lineId.replace(/:l\d+$/, ''));
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
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
        <span style={{ color: 'var(--ink-3)' }}>n / p · r · c</span>
        {' · '}
        <span style={{ color: 'var(--ink-4)' }}>v s</span>
      </div>
    </div>
  );
}
