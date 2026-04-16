import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager, SourceArg } from '../../session/manager.js';
import { logger } from '../../logger.js';
import type { ReviewSession } from '@shared/types';

const Source = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('github'), url: z.string().url() }),
  z.object({ kind: z.literal('github'), number: z.number().int().positive() }),
  z.object({ kind: z.literal('local'), base: z.string().min(1), head: z.string().min(1) }),
]);
const Input = z.object({ source: Source });

export function registerStartReview(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'start_review',
    {
      title: 'Start Review',
      description:
        'Open a local browser review workspace for a GitHub PR or a local-branch diff. Fetches the diff, parses hunks, persists state, and launches the default browser. Returns a paraphrased summary and the review URL.',
      inputSchema: Input.shape,
    },
    async ({ source }) => {
      try {
        const session = await manager.startReview(source as SourceArg);
        const text = renderSummary(session, manager.getLaunchUrl());
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        logger.error('start_review failed', err);
        return { content: [{ type: 'text' as const, text: renderFriendlyError(err) }], isError: true };
      }
    }
  );
}

function renderSummary(s: ReviewSession, url: string): string {
  const { pr, diff } = s;
  return [
    `**${pr.title}** by @${pr.author}`,
    `${pr.baseBranch} → ${pr.headBranch}  (+${pr.additions}/-${pr.deletions}, ${pr.filesChanged} files)`,
    '',
    pr.description || '(no description)', // Plan 04 adds paraphrase per D-20
    '',
    `Review open at: ${url}`,
  ].join('\n');
}

function renderFriendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `Failed to start review: ${msg}`;
}
