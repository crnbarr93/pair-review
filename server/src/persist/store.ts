import { promises as fs } from 'node:fs';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import lockfile from 'proper-lockfile';
import { stateFilePath } from './paths.js';

// Shape of the options bag accepted by `proper-lockfile.lock` — re-exported so
// tests (and any future caller) can spell it without re-importing the library.
export type WriteStateLockOptions = Parameters<typeof lockfile.lock>[1];

// Production-tight default. IDENTICAL to Phase 1 so no existing caller behavior
// drifts. When a caller passes `lockOptions`, this constant is bypassed and the
// supplied options are forwarded verbatim.
const DEFAULT_LOCK_OPTIONS = { retries: { retries: 3, minTimeout: 50 }, realpath: false } as const;

export async function writeState(
  prKey: string,
  data: object,
  lockOptions?: WriteStateLockOptions,
): Promise<void> {
  const file = stateFilePath(prKey);
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Ensure the target file exists before proper-lockfile tries to lock it
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, '{}');
  }
  const release = await lockfile.lock(file, lockOptions ?? DEFAULT_LOCK_OPTIONS);
  try {
    await writeFileAtomic(file, JSON.stringify(data, null, 2));
  } finally {
    await release();
  }
}

export async function readState(prKey: string): Promise<object | null> {
  const file = stateFilePath(prKey);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}
