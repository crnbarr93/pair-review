import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';
import type { DiffFile, FileStatus } from '@shared/types';

const Input = z.object({
  prKey: z.string().min(1).max(200),
  cursor: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(50).optional().default(30),
  includeExcluded: z.boolean().optional().default(false),
});

interface FileSummary {
  fileId: string;
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  hunkCount: number;
  generated: boolean;
}

interface ListFilesResponse {
  files: FileSummary[];
  nextCursor: string | null;
  totalFiles: number;
  excludedCount: number;
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64');
}

function decodeCursor(cursor: string): number {
  const raw = Buffer.from(cursor, 'base64').toString('utf8');
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error('cursor invalid');
  }
  return n;
}

function toFileSummary(f: DiffFile): FileSummary {
  let additions = 0;
  let deletions = 0;
  for (const h of f.hunks) {
    for (const l of h.lines) {
      if (l.kind === 'add') additions++;
      else if (l.kind === 'del') deletions++;
    }
  }
  return {
    fileId: f.id,
    path: f.path,
    status: f.status,
    additions,
    deletions,
    hunkCount: f.hunks.length,
    generated: f.generated,
  };
}

export function registerListFiles(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'list_files',
    {
      title: 'List Files',
      description:
        'Enumerate files in the current review session. Paginates at `limit` files per call; default limit=30. ' +
        'Generated files (lockfiles, dist/, .min.*, etc.) are filtered out by default. ' +
        'Pass includeExcluded: true to see them. Cursor is opaque — pass the nextCursor from the previous ' +
        "response to page forward. Response carries totalFiles and excludedCount so you know when you've " +
        'seen everything.',
      inputSchema: Input.shape,
    },
    async ({ prKey, cursor, limit, includeExcluded }) => {
      try {
        const session = manager.get(prKey);
        if (!session) {
          return {
            content: [
              {
                type: 'text' as const,
                text:
                  `session not found for prKey "${prKey}". Call start_review first, then retry list_files ` +
                  `with the prKey returned by start_review.`,
              },
            ],
            isError: true as const,
          };
        }

        const allFiles = session.diff.files;
        const excludedCount = includeExcluded ? 0 : allFiles.filter((f) => f.generated).length;
        const visibleFiles = includeExcluded ? allFiles : allFiles.filter((f) => !f.generated);

        let offset = 0;
        if (cursor !== undefined) {
          try {
            offset = decodeCursor(cursor);
          } catch {
            return {
              content: [
                {
                  type: 'text' as const,
                  text:
                    `cursor invalid. Call list_files without a cursor to restart pagination from the ` +
                    `beginning of this session's file list.`,
                },
              ],
              isError: true as const,
            };
          }
          if (offset >= visibleFiles.length) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text:
                    `cursor offset ${offset} is past the end of the file list (${visibleFiles.length} ` +
                    `files visible). Call list_files without a cursor to restart.`,
                },
              ],
              isError: true as const,
            };
          }
        }

        const effectiveLimit = limit ?? 30;
        const pageEnd = offset + effectiveLimit;
        const slice = visibleFiles.slice(offset, pageEnd);
        const nextCursor = pageEnd < visibleFiles.length ? encodeCursor(pageEnd) : null;

        const response: ListFilesResponse = {
          files: slice.map(toFileSummary),
          nextCursor,
          totalFiles: visibleFiles.length,
          excludedCount,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
        };
      } catch (err) {
        logger.error('list_files failed', err);
        return {
          content: [
            {
              type: 'text' as const,
              text: `list_files failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true as const,
        };
      }
    }
  );
}
