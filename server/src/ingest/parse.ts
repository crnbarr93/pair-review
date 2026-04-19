import parseDiff from 'parse-diff';
import { createHash } from 'node:crypto';
import type {
  DiffModel,
  DiffFile,
  Hunk,
  DiffLine,
  FileStatus,
  LineKind,
  LineSide,
} from '@shared/types';
import { isGeneratedFile } from './generated-file-detection.js';

// parse-diff Change type shapes
interface AddChange {
  type: 'add';
  add: true;
  ln: number;
  content: string;
}
interface DelChange {
  type: 'del';
  del: true;
  ln: number;
  content: string;
}
interface NormalChange {
  type: 'normal';
  normal: true;
  ln1: number;
  ln2: number;
  content: string;
}
type Change = AddChange | DelChange | NormalChange;

function lineFromChange(ch: Change, id: string, diffPosition: number): DiffLine {
  const kind: LineKind =
    ch.type === 'add' ? 'add' : ch.type === 'del' ? 'del' : 'context';
  const side: LineSide =
    kind === 'add' ? 'RIGHT' : kind === 'del' ? 'LEFT' : 'BOTH';
  let fileLine: number;
  if (ch.type === 'add') {
    fileLine = (ch as AddChange).ln ?? 0;
  } else if (ch.type === 'del') {
    fileLine = (ch as DelChange).ln ?? 0;
  } else {
    // normal/context: use right-side line number
    fileLine = (ch as NormalChange).ln2 ?? 0;
  }
  return {
    id,
    kind,
    side,
    fileLine,
    diffPosition,
    text: ch.content,
  };
}

export function toDiffModel(diffText: string): DiffModel {
  const files = parseDiff(diffText);
  const shaped: DiffFile[] = files.map((f) => {
    // Use destination path for ID, falling back to source path
    const path =
      f.to && f.to !== '/dev/null'
        ? f.to
        : f.from && f.from !== '/dev/null'
          ? f.from
          : 'unknown';
    const fileId = createHash('sha1').update(path).digest('hex').slice(0, 12);

    const status: FileStatus = f.deleted
      ? 'deleted'
      : f.new
        ? 'added'
        : f.from && f.to && f.from !== f.to
          ? 'renamed'
          : 'modified';

    const binary = (f.chunks?.length ?? 0) === 0 && !f.deleted && !f.new;

    const hunks: Hunk[] = (f.chunks ?? []).map((c, hi) => {
      let diffPosition = 1; // unified-diff position within file's hunks (GitHub API needs this)
      const lines: DiffLine[] = (c.changes as Change[]).map((ch, li) => {
        const line = lineFromChange(ch, `${fileId}:h${hi}:l${li}`, diffPosition);
        diffPosition++;
        return line;
      });
      return {
        id: `${fileId}:h${hi}`, // Opaque Hunk ID per D-17
        header: c.content,
        lines,
      };
    });

    return {
      id: fileId,
      path,
      oldPath: f.from && f.to && f.from !== f.to ? f.from : undefined,
      status,
      binary,
      hunks,
      generated: isGeneratedFile(path), // Phase 3 D-14
    };
  });

  return {
    files: shaped,
    totalHunks: shaped.reduce((s, f) => s + f.hunks.length, 0),
  };
}
