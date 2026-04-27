import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';
import type { Verdict } from '@shared/types';
import { collectPostableThreads } from '../../submit/anchor.js';

const VerdictEnum = z.enum(['request_changes', 'comment', 'approve']);

const Input = z.object({
  prKey: z.string().min(1).max(200),
  body: z.string().min(0).max(65536),
  verdict: VerdictEnum,
  exportPath: z.string().optional(),
});

export const DESCRIPTION: string = [
  'Proposes a review for user confirmation. The review is NOT posted immediately — the user confirms or edits in the browser.',
  '',
  'GitHub mode: creates a PR review via Octokit pulls.createReview with verdict, body, and all drafted inline comments.',
  'Local mode: exports the review to a markdown file on disk at exportPath.',
  '',
  'The `exportPath` parameter is required for local-branch reviews (prKey starts with `local:`). For GitHub reviews (prKey starts with `gh:`), exportPath is ignored.',
  '',
  'Two-step flow (D-05):',
  '  1. Call submit_review — the review is put in `pending_confirmation` state and the submit modal opens in the browser.',
  '  2. The user reviews and edits the body and verdict in the modal, then confirms.',
  '  3. The browser POSTs to /api/confirm-submit, which performs the actual GitHub API call or markdown export.',
  '',
  'Verdicts:',
  '  - request_changes: Request that the author address issues before merging',
  '  - comment: Provide commentary without blocking the PR',
  '  - approve: Approve the PR for merging',
  '',
  'The review body should summarize the overall findings from the self-review. Individual inline comments come from the drafted threads.',
  '',
  'Validation:',
  '  - At least one thread must have a draftBody OR body must be non-empty',
  '  - local: reviews require exportPath',
  '  - Duplicate submit is refused if submissionState is already submitted',
].join('\n');

export function registerSubmitReview(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'submit_review',
    { title: 'Submit Review', description: DESCRIPTION, inputSchema: Input.shape },
    async ({ prKey, body, verdict, exportPath }) => {
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

        // Idempotency gate (D-10): refuse if already submitted
        if (session.submissionState?.status === 'submitted') {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Review already submitted. submissionId: ${session.submissionState.submissionId}`,
              },
            ],
            isError: true as const,
          };
        }

        // Local-mode guard: exportPath required for local: reviews
        if (typeof prKey === 'string' && prKey.startsWith('local:') && !exportPath) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'exportPath is required for local-branch reviews',
              },
            ],
            isError: true as const,
          };
        }

        // Content gate: must have body or at least one postable thread
        const postableThreads = collectPostableThreads(session.threads ?? {}, session.selfReview?.findings);
        const hasBody = typeof body === 'string' && body.trim().length > 0;
        if (!hasBody && postableThreads.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'No review content: body is empty and no inline comments have been drafted',
              },
            ],
            isError: true as const,
          };
        }

        await manager.applyEvent(prKey, {
          type: 'submission.proposed',
          verdict: verdict as Verdict,
          body: body as string,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: 'Review proposed — awaiting user confirmation in the browser. The user will see the review summary, verdict, and inline comments in a submit modal. Once confirmed, the review will be posted to GitHub (or exported for local reviews).',
            },
          ],
        };
      } catch (err) {
        logger.error('submit_review failed', err);
        return {
          content: [
            {
              type: 'text' as const,
              text: `submit_review failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true as const,
        };
      }
    }
  );
}
