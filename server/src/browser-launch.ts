import open from 'open';
import { logger } from './logger.js';

export async function launchBrowser(url: string): Promise<void> {
  // D-13 MANDATE: stderr echo FIRST, before open() — macOS `open` doesn't reliably surface launch failure
  logger.info(`Open this URL in your browser if it didn't launch automatically: ${url}`);
  try {
    await open(url);
  } catch (err) {
    logger.warn('open() failed; URL above remains valid', err);
  }
}
