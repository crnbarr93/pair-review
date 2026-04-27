import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { clearHighlightCache } from '../../highlight/shiki.js';
import { logger } from '../../logger.js';

const Input = z.object({});

function reviewsDir(): string {
  const envBase = process.env.CLAUDE_PLUGIN_DATA;
  const base = envBase ?? path.resolve(process.cwd(), '.planning', '.cache');
  return path.join(base, 'reviews');
}

export function registerClearCache(mcp: McpServer): void {
  mcp.registerTool(
    'clear_cache',
    {
      title: 'Clear Cache',
      description:
        'Delete all persisted review state from disk and clear the in-memory syntax highlight cache. Returns a summary of what was removed.',
      inputSchema: Input.shape,
    },
    async () => {
      const dir = reviewsDir();
      const removed: string[] = [];

      try {
        const entries = await fs.readdir(dir);
        for (const entry of entries) {
          const full = path.join(dir, entry);
          const stat = await fs.stat(full);
          if (stat.isDirectory()) {
            await fs.rm(full, { recursive: true });
            removed.push(entry);
          }
        }
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }

      const highlightEntries = clearHighlightCache();

      const summary = removed.length > 0
        ? `Removed ${removed.length} cached review(s): ${removed.join(', ')}. Cleared ${highlightEntries} highlight cache entries.`
        : `No cached reviews on disk. Cleared ${highlightEntries} highlight cache entries.`;

      logger.info(summary);
      return { content: [{ type: 'text' as const, text: summary }] };
    },
  );
}
