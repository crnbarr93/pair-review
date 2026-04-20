import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';
import { CHECKLIST } from '../../checklist/index.js';
import type {
  ChecklistCategory,
  DiffModel,
  ResolvedFinding,
  SelfReview,
  Severity,
  Verdict,
} from '@shared/types';

const SeverityEnum = z.enum(['blocker', 'major', 'minor', 'nit']);
const Category = z.enum(['correctness', 'security', 'tests', 'performance', 'style']);
const VerdictEnum = z.enum(['request_changes', 'comment', 'approve']);
const CoverageStatus = z.enum(['pass', 'partial', 'fail']);

const FindingSchema = z.object({
  category: Category,
  checklistItemId: z.string().min(1).max(20),
  severity: SeverityEnum,
  lineId: z.string().regex(/^[A-Za-z0-9_-]+:h\d+:l\d+$/, {
    error:
      'Invalid lineId. Every finding must anchor via an opaque lineId from list_files/get_hunk. ' +
      'Format: `<fileId>:h<hunkIdx>:l<lineIdx>`. Never supply `path:line` strings.',
  }),
  title: z.string().min(1).max(200),
  rationale: z.string().min(1).max(2000),
});

const Input = z.object({
  prKey: z.string().min(1).max(200),
  findings: z.array(FindingSchema).max(100).refine(
    (fs) => fs.filter((f) => f.severity === 'nit').length <= 3,
    {
      error:
        'Too many nits (>3). The nit cap is structural — promote the most important to ' +
        '`minor` or higher severity, and drop the rest.',
    }
  ),
  coverage: z.object({
    correctness: CoverageStatus,
    security: CoverageStatus,
    tests: CoverageStatus,
    performance: CoverageStatus,
    style: CoverageStatus,
  }),
  verdict: VerdictEnum.default('request_changes'),
});

export const DESCRIPTION: string = [
  'Produce an adversarial self-review of the PR under review. YOUR JOB IS TO FIND REASONS TO REQUEST CHANGES, not to approve.',
  '',
  'Default verdict is `request_changes`. You must ARGUE THE VERDICT DOWN to `comment` or `approve` with evidence; never drift UP from `approve`. Omitting the verdict field is accepted as `request_changes` — the schema defaults that way on purpose.',
  '',
  'Checklist (criticality-ranked — 1 = foundational, 2 = substantive, 3 = advisory):',
  ...CHECKLIST.map(
    (i) => `  [${i.category}:${i.id}] (crit=${i.criticality}) ${i.text}${i.evaluationHint ? ' — ' + i.evaluationHint : ''}`
  ),
  '',
  "Devil's advocate pass — before submitting, ask:",
  '  - What could break at null / empty / error / concurrent boundaries?',
  '  - What did the author forget? (tests, rollback, telemetry, edge cases)',
  '  - If you authored a summary via set_pr_summary, apply the intent-appropriate review lens:',
  '      refactor → behavior preservation; feature → correctness + tests; bug-fix → regression check.',
  '',
  'Nit discipline: MAX 3 findings of severity `nit`. More than 3 and the schema rejects the entire payload. Promote the most important, drop the rest.',
  '',
  'Anchor discipline: every finding must reference a `lineId` returned by `list_files` / `get_hunk`. Never fabricate path:line strings — the schema rejects freeform anchors at ingress.',
  '',
  "Coverage discipline: every one of the 5 coverage slots (correctness, security, tests, performance, style) must be set to pass / partial / fail. Don't leave categories unexamined — an unjustified `pass` is a trust erosion.",
  '',
  'checklistItemId must match an id from the checklist above (e.g., `c-01`, `s-02`). Unknown ids are rejected.',
].join('\n');

const CHECKLIST_IDS = new Set(CHECKLIST.map((i) => i.id));

function resolveLineId(
  diff: DiffModel,
  lineId: string
): { path: string; line: number; side: 'LEFT' | 'RIGHT' | 'BOTH' } | null {
  const match = /^(.+):h(\d+):l(\d+)$/.exec(lineId);
  if (!match) return null;
  const [, fileId, hunkIdxRaw, lineIdxRaw] = match;
  const hunkIdx = Number(hunkIdxRaw);
  const lineIdx = Number(lineIdxRaw);
  const file = diff.files.find((f) => f.id === fileId);
  if (!file) return null;
  const hunk = file.hunks[hunkIdx];
  if (!hunk) return null;
  const line = hunk.lines[lineIdx];
  if (!line) return null;
  return { path: file.path, line: line.fileLine, side: line.side };
}

function renderAck(selfReview: SelfReview): string {
  const sev = selfReview.findings.reduce(
    (acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }),
    {} as Record<string, number>
  );
  const cov = selfReview.coverage;
  return (
    `Self-review recorded. Verdict: ${selfReview.verdict}. ${selfReview.findings.length} finding(s) ` +
    `(${sev.blocker ?? 0} blocker, ${sev.major ?? 0} major, ${sev.minor ?? 0} minor, ${sev.nit ?? 0} nit). ` +
    `Coverage: correctness=${cov.correctness}, security=${cov.security}, tests=${cov.tests}, ` +
    `performance=${cov.performance}, style=${cov.style}.`
  );
}

export function registerRunSelfReview(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'run_self_review',
    { title: 'Run Self-Review', description: DESCRIPTION, inputSchema: Input.shape },
    async ({ prKey, findings, coverage, verdict }) => {
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

        const typedFindings = findings as Array<{
          category: string;
          checklistItemId: string;
          severity: string;
          lineId: string;
          title: string;
          rationale: string;
        }>;

        const nitCount = typedFindings.filter((f) => f.severity === 'nit').length;
        if (nitCount > 3) {
          return {
            content: [
              {
                type: 'text' as const,
                text:
                  `Too many nits (${nitCount} > 3). The nit cap is structural — promote the most important to ` +
                  '`minor` or higher severity, and drop the rest.',
              },
            ],
            isError: true as const,
          };
        }

        for (const f of typedFindings) {
          if (!CHECKLIST_IDS.has(f.checklistItemId)) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text:
                    `checklistItemId "${f.checklistItemId}" not found in CHECKLIST. ` +
                    `See the tool description for valid ids (e.g., c-01, s-01).`,
                },
              ],
              isError: true as const,
            };
          }
        }

        const resolved: ResolvedFinding[] = [];
        for (const f of typedFindings) {
          const pos = resolveLineId(session.diff, f.lineId);
          if (!pos) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text:
                    `lineId "${f.lineId}" does not resolve to a diff line in this review session. ` +
                    `Re-fetch hunks via list_files/get_hunk and anchor findings against those IDs.`,
                },
              ],
              isError: true as const,
            };
          }
          resolved.push({
            id: nanoid(),
            category: f.category as ChecklistCategory,
            checklistItemId: f.checklistItemId,
            severity: f.severity as Severity,
            lineId: f.lineId,
            path: pos.path,
            line: pos.line,
            side: pos.side,
            title: f.title,
            rationale: f.rationale,
          });
        }

        const selfReview: SelfReview = {
          findings: resolved,
          coverage: coverage as SelfReview['coverage'],
          verdict: (verdict as Verdict) ?? 'request_changes',
          generatedAt: new Date().toISOString(),
        };

        await manager.applyEvent(prKey, { type: 'selfReview.set', selfReview });

        return { content: [{ type: 'text' as const, text: renderAck(selfReview) }] };
      } catch (err) {
        logger.error('run_self_review failed', err);
        return {
          content: [
            {
              type: 'text' as const,
              text: `run_self_review failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true as const,
        };
      }
    }
  );
}
