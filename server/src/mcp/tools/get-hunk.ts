import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';
import type { DiffLine, Hunk } from '@shared/types';

const Input = z.object({
  prKey: z.string().min(1).max(200),
  hunkId: z.string().min(1).max(200),
  cursor: z.string().max(100).optional(),
});

// Tuned so a slice's JSON.stringify stays under ~10kB (~2.5k tokens) on
// typical code lines (120 chars/line).
const SLICE_SIZE = 60;

interface GetHunkResponse {
  hunkId: string;
  fileId: string;
  path: string;
  header: string;
  lines: DiffLine[];
  nextCursor: string | null;
  totalLines: number;
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

function parseHunkId(hunkId: string): { fileId: string; hunkIdx: number } {
  const match = /^(.+):h(\d+)$/.exec(hunkId);
  if (!match) {
    throw new Error(`hunkId malformed: "${hunkId}" — expected format \`<fileId>:h<hunkIdx>\``);
  }
  return { fileId: match[1], hunkIdx: Number(match[2]) };
}

export function registerGetHunk(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'get_hunk',
    {
      title: 'Get Hunk',
      description:
        `Fetch a single hunk's diff lines by hunkId. Each line carries its opaque lineId — ` +
        `use these in run_self_review findings (never freeform path:line strings). hunkId format ` +
        `is \`<fileId>:h<hunkIdx>\` as returned from list_files. Large hunks paginate via cursor ` +
        `— typical hunks fit in a single call (nextCursor: null). Slice size is ${SLICE_SIZE} lines.`,
      inputSchema: Input.shape,
    },
    async ({ prKey, hunkId, cursor }) => {
      try {
        const session = manager.get(prKey);
        if (!session) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `session not found for prKey "${prKey}". Call start_review first.`,
              },
            ],
            isError: true as const,
          };
        }

        let parsed: { fileId: string; hunkIdx: number };
        try {
          parsed = parseHunkId(hunkId);
        } catch (err) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `${err instanceof Error ? err.message : String(err)} — call list_files then use the fileId + hunk index.`,
              },
            ],
            isError: true as const,
          };
        }

        const file = session.diff.files.find((f) => f.id === parsed.fileId);
        if (!file) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `fileId "${parsed.fileId}" not found in session. Re-fetch via list_files.`,
              },
            ],
            isError: true as const,
          };
        }

        const hunk: Hunk | undefined = file.hunks[parsed.hunkIdx];
        if (!hunk) {
          return {
            content: [
              {
                type: 'text' as const,
                text:
                  `hunkIdx ${parsed.hunkIdx} out of range for file "${file.path}" ` +
                  `(has ${file.hunks.length} hunks). Re-fetch via list_files.`,
              },
            ],
            isError: true as const,
          };
        }

        let offset = 0;
        if (cursor !== undefined) {
          try {
            offset = decodeCursor(cursor);
          } catch {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `cursor invalid. Call get_hunk without a cursor to restart at the beginning of the hunk.`,
                },
              ],
              isError: true as const,
            };
          }
          if (offset >= hunk.lines.length) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text:
                    `cursor offset ${offset} is past the end of hunk ${hunkId} ` +
                    `(${hunk.lines.length} lines). Call get_hunk without a cursor.`,
                },
              ],
              isError: true as const,
            };
          }
        }

        const pageEnd = offset + SLICE_SIZE;
        const sliced = hunk.lines.slice(offset, pageEnd);
        const nextCursor = pageEnd < hunk.lines.length ? encodeCursor(pageEnd) : null;

        const response: GetHunkResponse = {
          hunkId,
          fileId: file.id,
          path: file.path,
          header: hunk.header,
          lines: sliced,
          nextCursor,
          totalLines: hunk.lines.length,
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }] };
      } catch (err) {
        logger.error('get_hunk failed', err);
        return {
          content: [
            {
              type: 'text' as const,
              text: `get_hunk failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true as const,
        };
      }
    }
  );
}
