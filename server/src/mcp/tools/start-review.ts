import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager, SourceArg } from '../../session/manager.js';
import { logger } from '../../logger.js';
import type { ReviewSession } from '@shared/types';
import { getOctokit } from '../../submit/octokit-submit.js';
import { detectPendingReview } from '../../submit/pending-review.js';

// Zod v4 disallows duplicate discriminator values in discriminatedUnion.
// Use z.union with an inner union for the two github variants.
const Source = z.union([
  z.union([
    z.object({ kind: z.literal('github'), url: z.string().url() }),
    z.object({ kind: z.literal('github'), number: z.number().int().positive() }),
  ]),
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

        // D-08: Pending-review detection at session start (GitHub-only).
        // Runs post-startReview so the session is already in memory and on disk.
        // Failure must NOT block session start — fail open with logger.warn (T-6-03-05).
        if ((source as SourceArg).kind === 'github' && session.pr?.owner && session.pr?.repo && typeof session.pr?.number === 'number') {
          try {
            const octokit = await getOctokit();
            const pending = await detectPendingReview(
              octokit,
              session.pr.owner,
              session.pr.repo,
              session.pr.number,
            );
            if (pending) {
              await manager.applyEvent(session.prKey, {
                type: 'pendingReview.detected',
                reviewId: pending.id,
                createdAt: pending.createdAt,
                commentCount: pending.commentCount,
              });
            }
          } catch (err) {
            // Detection failure is non-fatal — the user can proceed without adopt/clear
            logger.warn('pending-review detection failed (non-fatal):', err instanceof Error ? err.message : String(err));
          }
        }

        // Use the per-session URL (base + &session=<prKey>). manager.getLaunchUrl()
        // is missing the session param the web bootstrap needs; clicking that bare
        // URL from chat dropped users into a "Session expired" page with no diff.
        const text = renderSummary(session, manager.sessionLaunchUrl(session.prKey));
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        logger.error('start_review failed', err);
        return { content: [{ type: 'text' as const, text: renderFriendlyError(err) }], isError: true };
      }
    }
  );
}

/**
 * Deterministic paraphrase of a PR description (D-20 / Pitfall 11 mitigation).
 *
 * Takes the first non-empty paragraph, strips markdown noise (headers, bullets,
 * HTML comments, code spans, links), collapses whitespace, and truncates to 280 chars.
 * If the description is empty or whitespace-only, returns a placeholder.
 *
 * This is a TEXTUAL transform — not LLM-interpreted — so the content is safe to pass
 * back into the LLM context as structured data rather than instructions.
 */
export function paraphrase(desc: string): string {
  if (!desc || !desc.trim()) return '(no description provided — review the changes below)';

  // Split into paragraphs FIRST (before whitespace collapse), then take the first one.
  // Paragraphs are separated by one or more blank lines.
  const paragraphs = desc.split(/\n\n+/);

  // Strip markdown from each paragraph candidate and find the first non-empty one
  for (const para of paragraphs) {
    const stripped = para
      .replace(/<!--[\s\S]*?-->/g, '')              // HTML comments
      .replace(/^#+\s+/gm, '')                       // ATX headers (## Heading)
      .replace(/^[-*+]\s+/gm, '')                    // Unordered list bullets
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')       // Markdown links → text
      .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')          // Inline code: strip backticks, keep content
      .replace(/\s+/g, ' ')
      .trim();

    if (stripped.length > 0) {
      return stripped.length > 280 ? stripped.slice(0, 277) + '...' : stripped;
    }
  }

  return '(no description provided — review the changes below)';
}

/**
 * Render the start_review tool return summary.
 * Exported as renderSummaryForTest for unit testing without mocking the full tool.
 */
export function renderSummaryForTest(s: ReviewSession, url: string): string {
  return renderSummary(s, url);
}

function renderSummary(s: ReviewSession, url: string): string {
  const { pr } = s;
  const lines = [
    `**${pr.title}** by @${pr.author}`,
    `${pr.baseBranch} → ${pr.headBranch}  (+${pr.additions}/-${pr.deletions}, ${pr.filesChanged} files)`,
    '',
    paraphrase(pr.description),
    '',
    `Review open at: ${url}`,
  ];
  if (s.summary) lines.push('', 'has_summary: true');
  if (s.walkthrough) lines.push('has_walkthrough: true');
  if (s.selfReview) lines.push('has_selfReview: true');
  return lines.join('\n');
}

function renderFriendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `Failed to start review: ${msg}`;
}
