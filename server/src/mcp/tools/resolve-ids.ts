import type { DiffModel, LineKind, LineSide } from '@shared/types';

export interface ResolvedLine {
  path: string;
  line: number;
  side: LineSide;
  lineKind: LineKind;
}

export function resolveLineIdExtended(diff: DiffModel, lineId: string): ResolvedLine | null {
  const match = /^(.+):h(\d+):l(\d+)$/.exec(lineId);
  if (!match) return null;
  const [, fileId, hunkIdxRaw, lineIdxRaw] = match;
  const file = diff.files.find((f) => f.id === fileId);
  if (!file) return null;
  const hunk = file.hunks[Number(hunkIdxRaw)];
  if (!hunk) return null;
  const dl = hunk.lines[Number(lineIdxRaw)];
  if (!dl) return null;
  return { path: file.path, line: dl.fileLine, side: dl.side, lineKind: dl.kind };
}

export function resolveHunkId(diff: DiffModel, hunkId: string): { path: string; header: string } | null {
  const match = /^(.+):h(\d+)$/.exec(hunkId);
  if (!match) return null;
  const [, fileId, hunkIdxRaw] = match;
  const file = diff.files.find((f) => f.id === fileId);
  if (!file) return null;
  const hunk = file.hunks[Number(hunkIdxRaw)];
  if (!hunk) return null;
  return { path: file.path, header: hunk.header };
}
