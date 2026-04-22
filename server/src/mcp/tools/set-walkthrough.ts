import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';
import { resolveHunkId } from './resolve-ids.js';
import type { Walkthrough, WalkthroughStep } from '@shared/types';

const WalkthroughStepSchema = z.object({
  hunkId: z.string().regex(/^[A-Za-z0-9_-]+:h\d+$/, {
    error: 'Invalid hunkId. Must be an opaque hunk ID from list_files/get_hunk. Format: `<fileId>:h<hunkIdx>`. Never construct hunkId strings from file paths or line numbers.',
  }),
  commentary: z.string().min(1).max(1000),
});

const Input = z.object({
  prKey: z.string().min(1).max(200),
  steps: z.array(WalkthroughStepSchema).min(1).max(200),
});

export const DESCRIPTION: string = [
  'Compose a hunk-by-hunk walkthrough narrative for the PR.',
  '',
  'Order discipline: prioritize changes that are core to the PR intent (from set_pr_summary intent field).',
  '  - refactor: start with the structural reshaping hunks, then test hunks',
  '  - feature: start with the new capability implementation, then tests, then config',
  '  - bug-fix: start with the fix hunk, then any regression test hunks',
  '  - Never use alphabetical file order or diff position order as the primary axis.',
  '',
  'Commentary discipline: 2-4 sentences per step.',
  '  - What this hunk does (the mechanism)',
  '  - Why it matters in context of the PR intent',
  '  - Any concern the reviewer should pay special attention to',
  '  - NOT a full code analysis — that is already in run_self_review findings.',
  '',
  'Anchor discipline: every hunkId must be an opaque value returned by list_files.',
  '  - Never construct hunkId strings from file paths or line numbers.',
  '  - Format: `<fileId>:h<hunkIdx>` — the schema rejects freeform anchors.',
].join('\n');

export function registerSetWalkthrough(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'set_walkthrough',
    { title: 'Set Walkthrough', description: DESCRIPTION, inputSchema: Input.shape },
    async ({ prKey, steps }) => {
      try {
        const session = manager.get(prKey);
        if (!session) {
          return {
            content: [{ type: 'text' as const, text: `session not found for prKey "${prKey}". Call start_review first.` }],
            isError: true as const,
          };
        }

        // Validate every hunkId resolves to a real hunk
        const typedSteps = steps as Array<{ hunkId: string; commentary: string }>;
        for (const step of typedSteps) {
          const resolved = resolveHunkId(session.diff, step.hunkId);
          if (!resolved) {
            return {
              content: [{ type: 'text' as const, text: `hunkId "${step.hunkId}" not found in session diff. Use opaque IDs from list_files.` }],
              isError: true as const,
            };
          }
        }

        const walkthroughSteps: WalkthroughStep[] = typedSteps.map((s, i) => ({
          stepNum: i + 1,
          hunkId: s.hunkId,
          commentary: s.commentary,
          status: 'pending' as const,
        }));

        const walkthrough: Walkthrough = {
          steps: walkthroughSteps,
          cursor: 0,
          showAll: false,
          generatedAt: new Date().toISOString(),
        };

        await manager.applyEvent(prKey, { type: 'walkthrough.set', walkthrough });
        return {
          content: [{
            type: 'text' as const,
            text: `Walkthrough set. ${typedSteps.length} step(s). First step: hunk ${typedSteps[0].hunkId}.`,
          }],
        };
      } catch (err) {
        logger.error('set_walkthrough failed', err);
        return {
          content: [{ type: 'text' as const, text: `set_walkthrough failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true as const,
        };
      }
    }
  );
}
