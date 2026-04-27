// Phase 6 — POST /api/confirm-submit
//
// The browser-side endpoint that fires after the user confirms in the submit modal.
// Receives the user's final verdict, body, and (for local: reviews) exportPath.
// Performs the actual GitHub Octokit call or markdown export.
//
// Security boundaries:
//   - hostValidate runs first (DNS rebinding defense)
//   - secureHeadersMw emits CSP
//   - tokenValidate runs automatically on /api/* (T-6-03-01 mitigation)
//   - zod .strict() schema rejects unknown keys
//
// D-05: Two-step flow — LLM proposes via submit_review MCP tool, user confirms here.
// D-10: Idempotency gate — returns 409 if submissionState.status === 'submitted'.

import type { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';
import { submitGithubReview } from '../../submit/octokit-submit.js';
import { exportReviewMarkdown } from '../../submit/markdown-export.js';
import type { Verdict } from '@shared/types';

const confirmSubmitBody = z
  .object({
    prKey: z.string().min(1),
    verdict: z.enum(['approve', 'request_changes', 'comment']),
    body: z.string().min(0).max(65536),
    exportPath: z.string().optional(),
  })
  .strict();

/**
 * Parse a gh: prKey of the form `gh:owner/repo#number` into owner, repo, pullNumber.
 * Returns null if the key does not match the expected format.
 */
function parseGithubKey(
  prKey: string
): { owner: string; repo: string; pullNumber: number } | null {
  const m = prKey.match(/^gh:([^/]+)\/([^#]+)#(\d+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], pullNumber: parseInt(m[3], 10) };
}

export function mountConfirmSubmit(app: Hono, manager: SessionManager): void {
  app.post('/api/confirm-submit', async (c) => {
    const parsed = confirmSubmitBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.text('Bad request', 400);

    const { prKey, verdict, body, exportPath } = parsed.data;

    const session = manager.get(prKey);
    if (!session) return c.text('Unknown session', 404);

    // D-10: Idempotency gate — refuse duplicate submit
    if (session.submissionState?.status === 'submitted') {
      return c.text('Already submitted', 409);
    }

    // Generate submissionId now — embedded in review body per D-10
    const submissionId = nanoid(12);

    // Step 1: transition to submitting
    await manager.applyEvent(prKey, { type: 'submission.confirmed', submissionId });

    try {
      if (prKey.startsWith('gh:')) {
        // GitHub mode
        const parsed = parseGithubKey(prKey);
        if (!parsed) {
          const errMsg = `Invalid gh: prKey format: "${prKey}"`;
          await manager.applyEvent(prKey, { type: 'submission.failed', error: errMsg });
          return c.json({ ok: false, error: errMsg }, 500);
        }

        const { owner, repo, pullNumber } = parsed;
        const result = await submitGithubReview({
          owner,
          repo,
          pullNumber,
          headSha: session.headSha,
          verdict: verdict as Verdict,
          body,
          threads: session.threads ?? {},
          findings: session.selfReview?.findings ?? [],
          submissionId,
        });

        await manager.applyEvent(prKey, {
          type: 'submission.completed',
          reviewId: result.reviewId,
          url: result.url,
          submissionId,
        });

        logger.info(`Review submitted: reviewId=${result.reviewId} url=${result.url}`);
        return c.json({ ok: true, url: result.url });
      } else if (prKey.startsWith('local:')) {
        // Local mode
        if (!exportPath) {
          const errMsg = 'exportPath required for local reviews';
          await manager.applyEvent(prKey, { type: 'submission.failed', error: errMsg });
          return c.text(errMsg, 400);
        }

        await exportReviewMarkdown({
          verdict: verdict as Verdict,
          body,
          threads: session.threads ?? {},
          findings: session.selfReview?.findings ?? [],
          baseRef: session.pr?.baseBranch ?? 'base',
          headRef: session.pr?.headBranch ?? 'head',
          title: session.pr?.title ?? 'Local Review',
          exportPath,
        });

        await manager.applyEvent(prKey, {
          type: 'submission.completed',
          submissionId,
          exportPath,
        });

        logger.info(`Review exported to: ${exportPath}`);
        return c.json({ ok: true, path: exportPath });
      } else {
        const errMsg = `Unknown prKey mode for prKey: "${prKey}"`;
        await manager.applyEvent(prKey, { type: 'submission.failed', error: errMsg });
        return c.json({ ok: false, error: errMsg }, 500);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('confirm-submit failed', err);
      await manager.applyEvent(prKey, { type: 'submission.failed', error: errMsg });
      return c.json({ ok: false, error: errMsg }, 500);
    }
  });
}
