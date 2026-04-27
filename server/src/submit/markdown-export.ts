import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Thread, Verdict, ResolvedFinding } from '@shared/types';
import { collectPostableThreads, collectPostableFindings } from './anchor.js';

/**
 * Validate exportPath before writing. Path traversal defense per RESEARCH.md Security Domain.
 * - Must be absolute
 * - Must end with .md
 * - Must not contain .. segments
 */
export function validateExportPath(exportPath: string): void {
  if (!path.isAbsolute(exportPath)) {
    throw new Error('exportPath must be an absolute path');
  }
  if (path.extname(exportPath) !== '.md') {
    throw new Error('exportPath must end with .md');
  }
  if (exportPath.includes('..')) {
    throw new Error('exportPath must not contain ".." segments');
  }
}

export interface ExportParams {
  verdict: Verdict;
  body: string;
  threads: Record<string, Thread>;
  findings?: ResolvedFinding[];
  baseRef: string;
  headRef: string;
  title: string;
  exportPath: string;
}

/**
 * Export a review to a markdown file on disk per D-11.
 * Format: verdict header, base->head refs, date, summary body, then inline comments.
 */
export async function exportReviewMarkdown(params: ExportParams): Promise<void> {
  validateExportPath(params.exportPath);

  const postable = collectPostableThreads(params.threads);
  const verdictLabel: Record<Verdict, string> = {
    approve: 'Approve',
    request_changes: 'Request changes',
    comment: 'Comment',
  };

  const lines: string[] = [
    `# Review: ${params.title}`,
    `**Verdict:** ${verdictLabel[params.verdict]}`,
    `**Base -> Head:** ${params.baseRef} -> ${params.headRef}`,
    `**Date:** ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    params.body,
    '',
  ];

  if (postable.length > 0) {
    lines.push('## Inline Comments', '');
    for (const t of postable) {
      lines.push(
        `### ${t.path}:${t.line} (${t.side})`,
        '',
        t.draftBody ?? '',
        '',
      );
    }
  }

  const postableFindings = collectPostableFindings(params.findings ?? [], params.threads);
  if (postableFindings.length > 0) {
    lines.push('## Self-Review Findings', '');
    for (const f of postableFindings) {
      lines.push(
        `### [${f.severity.toUpperCase()}] ${f.title}`,
        `**${f.path}:${f.line}** (${f.side})`,
        '',
        f.rationale,
        '',
      );
    }
  }

  await fs.writeFile(params.exportPath, lines.join('\n'), 'utf-8');
}
