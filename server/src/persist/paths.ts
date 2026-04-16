import path from 'node:path';
import { logger } from '../logger.js';

let warnedOnce = false;

export function stateFilePath(prKey: string): string {
  const envBase = process.env.CLAUDE_PLUGIN_DATA;
  const base = envBase ?? path.resolve(process.cwd(), '.planning', '.cache');
  if (!envBase && !warnedOnce) {
    logger.warn(`CLAUDE_PLUGIN_DATA unset; falling back to ${base}`);
    warnedOnce = true;
  }
  // SANITIZE pr-key for filesystem use — path traversal defense (T-07)
  // Replace /, #, :, and \ which are filesystem-unsafe or path-traversal vectors
  const safe = prKey.replace(/[/#:\\]/g, '_');
  return path.join(base, 'reviews', safe, 'state.json');
}
