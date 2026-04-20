import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';
import type { PrSummary } from '@shared/types';

const SummarySchema = z.object({
  intent: z.enum(['bug-fix', 'refactor', 'feature', 'chore', 'other']),
  intentConfidence: z.number().min(0).max(1),
  paraphrase: z.string().min(1).max(2000),
  keyChanges: z.array(z.string().min(1).max(400)).max(20),
  riskAreas: z.array(z.string().min(1).max(400)).max(20),
  generatedAt: z.string().min(1).max(40).optional(),
});

const Input = z.object({
  prKey: z.string().min(1).max(200),
  summary: SummarySchema,
});

// D-09 / D-20: the description IS the prompt for this tool. The Claude Code session reads
// this string via tools/list at connection time. No runtime templating, no separate prompt file.
const DESCRIPTION = [
  'Record a structured summary of the PR under review for the user to see in the summary pane.',
  '',
  'STRUCTURED FIELDS — NOT MARKDOWN. Fill each field separately:',
  "  - intent: one of bug-fix | refactor | feature | chore | other. Classify the AUTHOR's stated intent.",
  '  - intentConfidence: 0-1. Lower this if the PR description is ambiguous or the diff contradicts the description.',
  "  - paraphrase: RESTATE THE AUTHOR'S DESCRIPTION — keep the author's framing and stated goal intact.",
  '    Do NOT summarize the diff here. If the author says "this is a refactor — no behavior change",',
  "    your paraphrase must preserve that claim in the author's own framing. The UI renders this",
  '    adjacent to a collapsed "Author\'s description" pane; mismatches are visible to the user at a glance.',
  '  - keyChanges: one-line descriptions of the core changes in the diff (not the PR description).',
  '  - riskAreas: one-line call-outs for reviewer attention (security-adjacent code, behavior-preserving',
  '    claims that deserve verification, new external surfaces, etc.).',
  '  - generatedAt (optional): ISO timestamp; server coerces to now() if omitted.',
  '',
  'REGENERATION: Call this tool again with a new payload to replace the previous summary silently.',
  'There is no history / version flip-back / staleness flag; the latest call wins atomically.',
  '',
  'DOWNSTREAM: The intent field drives the review lens run_self_review will apply',
  '(refactor → behavior preservation; feature → correctness + tests; bug-fix → regression check).',
  'Get the intent right — everything else cascades off it.',
].join('\n');

export function registerSetPrSummary(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'set_pr_summary',
    { title: 'Set PR Summary', description: DESCRIPTION, inputSchema: Input.shape },
    async ({ prKey, summary }) => {
      try {
        const session = manager.get(prKey);
        if (!session) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `session not found for prKey "${prKey}". Call start_review first, then retry set_pr_summary.`,
              },
            ],
            isError: true as const,
          };
        }

        const coerced: PrSummary = {
          ...(summary as Omit<PrSummary, 'generatedAt'> & { generatedAt?: string }),
          generatedAt: (summary as { generatedAt?: string }).generatedAt ?? new Date().toISOString(),
        };

        await manager.applyEvent(prKey, { type: 'summary.set', summary: coerced });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Summary recorded. Intent: ${coerced.intent} (${Math.round(coerced.intentConfidence * 100)}% confident). ${coerced.keyChanges.length} key change(s), ${coerced.riskAreas.length} risk area(s).`,
            },
          ],
        };
      } catch (err) {
        logger.error('set_pr_summary failed', err);
        return {
          content: [
            {
              type: 'text' as const,
              text: `set_pr_summary failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true as const,
        };
      }
    }
  );
}
