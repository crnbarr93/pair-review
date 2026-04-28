import { useSyncExternalStore } from 'react';
import type {
  AppStatePhase,
  AuthIdentity,
  ChatMessage,
  ChecklistCategory,
  CIStatus,
  DiffModel,
  FileReviewStatus,
  PendingReview,
  PrSummary,
  PullRequestMeta,
  ReadOnlyComment,
  SelfReview,
  ShikiFileTokens,
  SnapshotMessage,
  SubmissionState,
  Thread,
  UpdateMessage,
  Verdict,
  Walkthrough,
} from '@shared/types';
import type { ChooseResumeSource } from './api';

/**
 * Phase-2-extended app state. Supersedes the AppState export in shared/types
 * for all web consumers; the shared definition is kept for inheritance/import
 * compatibility but the authoritative shape lives here because Phase 2 adds
 * web-only fields (source, sessionKey, headShaError, staleDiff).
 */
export interface AppState {
  phase: AppStatePhase;
  session: { active: boolean };
  pr?: PullRequestMeta;
  diff?: DiffModel;
  shikiTokens?: Record<string, ShikiFileTokens>;
  errorVariant?: 'unreachable' | 'fetch-failed';
  launchUrl: string;
  tokenLast4: string;
  // Phase 2 additions
  staleDiff?: { storedSha: string; currentSha: string };
  sessionKey: string;
  source?: ChooseResumeSource;
  headShaError?: { variant: 'head-sha-check-failed'; message: string };
  // Phase 3 additions (mirror ReviewSession Phase 3 fields)
  fileReviewStatus: Record<string, FileReviewStatus>;
  expandedGeneratedFiles: Record<string, boolean>;
  existingComments: ReadOnlyComment[];
  ciStatus: CIStatus | undefined;
  // Phase 3 addition — first-class prKey for Plan 03-05 postSessionEvent call sites.
  // Empty string sentinel when no snapshot has arrived yet; consumers use a falsy
  // check to short-circuit (T-3-13 mitigation).
  prKey: string;
  // Phase 4 additions
  summary: PrSummary | null;
  selfReview: SelfReview | null;
  findingsSidebarOpen: boolean;
  activeCategory: ChecklistCategory | null;
  // Phase 5 additions
  walkthrough: Walkthrough | null;
  threads: Record<string, Thread>;
  /** Track threadIds where user has locally edited draftBody (Pitfall 3 protection) */
  locallyEditedDrafts: Set<string>;
  // Phase 6 additions
  submissionState: SubmissionState | null;
  pendingSubmission: { verdict: Verdict; body: string } | null;
  pendingReview: PendingReview | null;
  submitModalOpen: boolean;
  // Phase 06.1 additions
  chatMessages: ChatMessage[];
  requestQueue: { pending: number };
  chatPanelOpen: boolean;
  // Phase 06.2 — client-only step routing (NOT in server session model)
  activeStep: 'summary' | 'walkthrough' | 'review' | 'submission';
  // Phase 7 additions (D-02/D-04)
  authenticatedUser: AuthIdentity | null;
}

const INITIAL: AppState = {
  phase: 'loading',
  session: { active: false },
  launchUrl: '',
  tokenLast4: '',
  sessionKey: '',
  fileReviewStatus: {},
  expandedGeneratedFiles: {},
  existingComments: [],
  ciStatus: undefined,
  prKey: '',
  summary: null,
  selfReview: null,
  findingsSidebarOpen: false,
  activeCategory: null,
  walkthrough: null,
  threads: {},
  locallyEditedDrafts: new Set<string>(),
  submissionState: null,
  pendingSubmission: null,
  pendingReview: null,
  submitModalOpen: false,
  chatMessages: [],
  requestQueue: { pending: 0 },
  chatPanelOpen: true,  // open by default per D-07
  activeStep: 'summary',
  authenticatedUser: null,
};

let state: AppState = { ...INITIAL };

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/**
 * Merge thread state from server while preserving locally-edited draftBody values.
 * Pitfall 3 mitigation: user edits the draftBody textarea after draft_comment sets it;
 * a subsequent SSE update must NOT overwrite the user's local edits.
 */
function mergeThreadsFromServer(
  incoming: Record<string, Thread>,
  local: Record<string, Thread>,
  locallyEdited: Set<string>,
): Record<string, Thread> {
  const merged: Record<string, Thread> = { ...incoming };
  for (const tid of locallyEdited) {
    if (merged[tid] && local[tid] && local[tid].draftBody !== undefined) {
      merged[tid] = { ...merged[tid], draftBody: local[tid].draftBody };
    }
  }
  return merged;
}

export function useAppStore(): AppState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state
  );
}

export const actions = {
  onAdoptFailed(_variant: 'unreachable') {
    state = {
      ...state,
      phase: 'error',
      errorVariant: 'unreachable',
      session: { active: false },
    };
    emit();
  },

  onSnapshot(msg: SnapshotMessage) {
    const s = msg.session;
    const hasFiles = s.diff.files.length > 0;
    const isHeadShaError = !!(
      s.error && s.error.message.startsWith('head-sha-check-failed:')
    );
    state = {
      ...state,
      phase: s.error ? 'error' : hasFiles ? 'diff' : 'empty',
      session: { active: true },
      pr: s.pr,
      diff: s.diff,
      shikiTokens: s.shikiTokens,
      errorVariant: s.error ? 'fetch-failed' : undefined,
      launchUrl: msg.launchUrl,
      tokenLast4: msg.tokenLast4,
      staleDiff: s.staleDiff,
      sessionKey: s.prKey,
      prKey: s.prKey,
      fileReviewStatus: s.fileReviewStatus ?? {},
      expandedGeneratedFiles: s.expandedGeneratedFiles ?? {},
      existingComments: s.existingComments ?? [],
      ciStatus: s.ciStatus,
      headShaError:
        isHeadShaError && s.error
          ? { variant: 'head-sha-check-failed', message: s.error.message }
          : undefined,
      summary: s.summary ?? null,
      selfReview: s.selfReview ?? null,
      walkthrough: s.walkthrough ?? null,
      threads: mergeThreadsFromServer(s.threads ?? {}, state.threads, state.locallyEditedDrafts),
      chatMessages: s.chatMessages ?? [],
      requestQueue: s.requestQueue ?? { pending: 0 },
      authenticatedUser: s.authenticatedUser ?? null,
    };
    emit();
  },

  onUpdate(msg: UpdateMessage) {
    const s = msg.state;
    const hasFiles = s.diff.files.length > 0;
    state = {
      ...state,
      phase: s.error ? 'error' : hasFiles ? 'diff' : 'empty',
      pr: s.pr,
      diff: s.diff,
      shikiTokens: s.shikiTokens,
      staleDiff: s.staleDiff,
      prKey: s.prKey,
      fileReviewStatus: s.fileReviewStatus ?? {},
      expandedGeneratedFiles: s.expandedGeneratedFiles ?? {},
      existingComments: s.existingComments ?? [],
      ciStatus: s.ciStatus,
      headShaError: undefined, // an update arrived -> previous head-sha-check-failed is cleared
      summary: s.summary ?? null,
      selfReview: s.selfReview ?? null,
      walkthrough: s.walkthrough ?? null,
      threads: mergeThreadsFromServer(s.threads ?? {}, state.threads, state.locallyEditedDrafts),
      submissionState: s.submissionState ?? null,
      pendingSubmission: s.pendingSubmission ?? null,
      pendingReview: s.pendingReview ?? null,
      chatMessages: s.chatMessages ?? state.chatMessages,
      requestQueue: s.requestQueue ?? state.requestQueue,
      authenticatedUser: s.authenticatedUser ?? null,
    };
    emit();
  },

  onSummarySet(msg: UpdateMessage) {
    state = { ...state, summary: msg.state.summary ?? null };
    emit();
  },

  onSelfReviewSet(msg: UpdateMessage) {
    const wasNull = state.selfReview == null;
    state = {
      ...state,
      selfReview: msg.state.selfReview ?? null,
      // The server reducer creates Thread objects from findings on selfReview.set,
      // so we must also sync threads here to keep browser state consistent.
      threads: mergeThreadsFromServer(msg.state.threads ?? {}, state.threads, state.locallyEditedDrafts),
      findingsSidebarOpen: wasNull && msg.state.selfReview != null ? true : state.findingsSidebarOpen,
    };
    emit();
  },

  onWalkthroughSet(msg: UpdateMessage) {
    state = { ...state, walkthrough: msg.state.walkthrough ?? null };
    emit();
  },

  onSubmissionProposed(msg: UpdateMessage) {
    state = {
      ...state,
      pendingSubmission: msg.state.pendingSubmission ?? null,
      submissionState: msg.state.submissionState ?? null,
      submitModalOpen: true,
    };
    emit();
  },

  onSubmissionConfirmed(msg: UpdateMessage) {
    state = {
      ...state,
      submissionState: msg.state.submissionState ?? null,
    };
    emit();
  },

  onSubmissionCompleted(msg: UpdateMessage) {
    state = {
      ...state,
      submissionState: msg.state.submissionState ?? null,
      pendingSubmission: null,
      submitModalOpen: false,
    };
    emit();
  },

  onSubmissionFailed(msg: UpdateMessage) {
    state = {
      ...state,
      submissionState: msg.state.submissionState ?? null,
    };
    emit();
  },

  onPendingReviewDetected(msg: UpdateMessage) {
    state = {
      ...state,
      pendingReview: msg.state.pendingReview ?? null,
    };
    emit();
  },

  onPendingReviewResolved() {
    state = {
      ...state,
      pendingReview: null,
    };
    emit();
  },

  onChatUserMessage(msg: UpdateMessage) {
    const s = msg.state;
    state = { ...state, chatMessages: s.chatMessages ?? state.chatMessages };
    emit();
  },

  onChatLlmMessage(msg: UpdateMessage) {
    const s = msg.state;
    state = { ...state, chatMessages: s.chatMessages ?? state.chatMessages };
    emit();
  },

  onRequestQueued(msg: UpdateMessage) {
    const s = msg.state;
    state = { ...state, requestQueue: s.requestQueue ?? state.requestQueue };
    emit();
  },

  onRequestProcessing(msg: UpdateMessage) {
    const s = msg.state;
    state = { ...state, requestQueue: s.requestQueue ?? state.requestQueue };
    emit();
  },

  onThreadUserStarted(msg: UpdateMessage) {
    state = {
      ...state,
      threads: mergeThreadsFromServer(msg.state.threads ?? {}, state.threads, state.locallyEditedDrafts),
    };
    emit();
  },

  setChatPanelOpen(open: boolean) {
    state = { ...state, chatPanelOpen: open };
    emit();
  },

  setActiveStep(step: 'summary' | 'walkthrough' | 'review' | 'submission') {
    state = { ...state, activeStep: step };
    emit();
    location.hash = step;
  },

  onThreadReplyAdded(msg: UpdateMessage) {
    state = {
      ...state,
      threads: mergeThreadsFromServer(msg.state.threads ?? {}, state.threads, state.locallyEditedDrafts),
    };
    emit();
  },

  onDraftSet(msg: UpdateMessage) {
    state = {
      ...state,
      threads: mergeThreadsFromServer(msg.state.threads ?? {}, state.threads, state.locallyEditedDrafts),
    };
    emit();
  },

  onThreadResolved(msg: UpdateMessage) {
    state = {
      ...state,
      threads: mergeThreadsFromServer(msg.state.threads ?? {}, state.threads, state.locallyEditedDrafts),
    };
    emit();
  },

  /** Called when user edits a draft comment textarea locally */
  updateLocalDraft(threadId: string, body: string) {
    const thread = state.threads[threadId];
    if (!thread) return;
    const newEdited = new Set(state.locallyEditedDrafts);
    newEdited.add(threadId);
    state = {
      ...state,
      threads: { ...state.threads, [threadId]: { ...thread, draftBody: body } },
      locallyEditedDrafts: newEdited,
    };
    emit();
  },

  toggleFindingsSidebar() {
    state = { ...state, findingsSidebarOpen: !state.findingsSidebarOpen };
    emit();
  },

  setActiveCategory(cat: ChecklistCategory | null) {
    state = { ...state, activeCategory: cat };
    emit();
  },

  setSource(source: ChooseResumeSource) {
    state = { ...state, source };
    emit();
  },

  setSubmitModalOpen(open: boolean) {
    state = { ...state, submitModalOpen: open };
    emit();
  },

  onSessionExpired() {
    state = { ...state, session: { active: false } };
    emit();
  },
};

// Test-only exports (guarded by underscore prefix — see plan rule on stubs).
// Not load-bearing for production; kept tiny so bundlers can tree-shake them.
export function __resetForTesting(): void {
  state = { ...INITIAL };
}

export function __getStateForTesting(): AppState {
  return state;
}
