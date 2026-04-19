import open from 'open';
import { logger } from './logger.js';

export async function launchBrowser(url: string): Promise<void> {
  // D-13 MANDATE: stderr echo FIRST, before open() — macOS `open` doesn't reliably surface launch failure
  logger.info(`Open this URL in your browser if it didn't launch automatically: ${url}`);
  // Opt-out for e2e tests and other automation that boots the real server binary.
  // Set GIT_REVIEW_NO_BROWSER=1 to print the URL but skip the actual browser launch.
  if (process.env.GIT_REVIEW_NO_BROWSER === '1') {
    return;
  }
  try {
    await open(url);
  } catch (err) {
    logger.warn('open() failed; URL above remains valid', err);
  }
}
