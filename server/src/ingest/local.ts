import { execa } from 'execa';

export async function ingestLocal(
  base: string,
  head: string,
  cwd: string
): Promise<{ diffText: string; baseSha: string; headSha: string }> {
  // Fail-fast on bad refs BEFORE running diff (both in parallel for speed)
  let baseSha: string, headSha: string;
  try {
    const [b, h] = await Promise.all([
      execa('git', ['rev-parse', '--verify', base], { cwd }),
      execa('git', ['rev-parse', '--verify', head], { cwd }),
    ]);
    baseSha = b.stdout.trim();
    headSha = h.stdout.trim();
  } catch (err) {
    throw mapGitError(err, `Invalid ref: ${base} or ${head}`);
  }

  // Three-dot = merge-base diff (GitHub parity per D-16)
  // Argv array — no shell; string concatenation is safe inside a JS array element (T-05)
  try {
    const threeDotsRange = base + '...' + head;
    const { stdout } = await execa('git', ['diff', threeDotsRange], { cwd });
    return { diffText: stdout, baseSha, headSha };
  } catch (err) {
    throw mapGitError(err, 'git diff failed');
  }
}

function mapGitError(err: unknown, fallback: string): Error {
  if (err instanceof Error) {
    const raw = err as Error & { stderr?: unknown };
    const stderr = typeof raw.stderr === 'string' ? raw.stderr : '';
    if (stderr.includes('not a git repository')) {
      return new Error(
        'Not inside a git repository. cd to your repo root and try again.'
      );
    }
    if (stderr.includes('unknown revision') || stderr.includes('bad revision')) {
      return new Error(
        `Unknown git ref. Check that ${fallback.replace('Invalid ref: ', '')} exist.`
      );
    }
    return new Error(`${fallback}: ${err.message}`);
  }
  return new Error(fallback);
}
