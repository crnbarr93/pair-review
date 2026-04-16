import { useSyncExternalStore } from 'react';
import type { AppState, SnapshotMessage } from '@shared/types';

let state: AppState = {
  phase: 'loading',
  session: { active: false },
  launchUrl: '',
  tokenLast4: '',
};

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
    state = { ...state, phase: 'error', errorVariant: 'unreachable', session: { active: false } };
    emit();
  },

  onSnapshot(msg: SnapshotMessage) {
    const hasFiles = msg.session.diff.files.length > 0;
    state = {
      phase: msg.session.error ? 'error' : hasFiles ? 'diff' : 'empty',
      session: { active: true },
      pr: msg.session.pr,
      diff: msg.session.diff,
      shikiTokens: msg.session.shikiTokens,
      errorVariant: msg.session.error ? 'fetch-failed' : undefined,
      launchUrl: msg.launchUrl,
      tokenLast4: msg.tokenLast4,
    };
    emit();
  },

  onSessionExpired() {
    state = { ...state, session: { active: false } };
    emit();
  },
};
