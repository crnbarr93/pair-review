import type { SnapshotMessage } from '@shared/types';

export async function adoptSession(token: string): Promise<boolean> {
  const res = await fetch('/api/session/adopt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    credentials: 'same-origin',
  });
  return res.ok;
}

export function openEventStream(
  sessionKey: string,
  onSnapshot: (msg: SnapshotMessage) => void,
  onError: () => void
): () => void {
  const es = new EventSource(`/api/events?session=${encodeURIComponent(sessionKey)}`, {
    withCredentials: true,
  });

  const handler = (ev: MessageEvent) => {
    try {
      onSnapshot(JSON.parse(ev.data) as SnapshotMessage);
    } catch {
      onError();
    }
  };

  es.addEventListener('snapshot', handler as EventListener);
  es.onerror = onError;

  return () => es.close();
}
