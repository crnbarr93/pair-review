import { useSyncExternalStore } from 'react';
import type {
  AppStatePhase,
  CIStatus,
  DiffModel,
  FileReviewStatus,
  PullRequestMeta,
  ReadOnlyComment,
  ShikiFileTokens,
  SnapshotMessage,
  UpdateMessage,
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
};

let state: AppState = { ...INITIAL };

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
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
      headShaError: undefined, // an update arrived → previous head-sha-check-failed is cleared
    };
    emit();
  },

  setSource(source: ChooseResumeSource) {
    state = { ...state, source };
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
