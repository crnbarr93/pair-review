import { execa } from 'execa';
import type { AuthIdentity } from '@shared/types';

/**
 * Fetch the authenticated GitHub user identity via `gh api user`.
 * Per D-04: NEVER throws — returns null on any error (fail-open).
 * Per D-03: Detects mismatch between `gh auth token` user and `GITHUB_TOKEN` user.
 */
export async function fetchAuthIdentity(): Promise<AuthIdentity | null> {
  try {
    const { stdout } = await execa('gh', [
      'api', 'user', '--jq', '{login:.login,avatar_url:.avatar_url}',
    ]);
    const parsed = JSON.parse(stdout) as { login: string; avatar_url: string };
    const identity: AuthIdentity = {
      login: parsed.login,
      avatarUrl: parsed.avatar_url,
      mismatch: false,
    };

    // D-03: detect token mismatch if GITHUB_TOKEN env var is set
    const envToken = process.env.GITHUB_TOKEN;
    if (envToken) {
      identity.mismatch = await detectTokenMismatch(parsed.login, envToken);
    }
    return identity;
  } catch {
    return null;  // D-04: fail-open — badge simply absent
  }
}

/**
 * Compare GITHUB_TOKEN identity against gh auth token identity.
 * Inner try/catch: mismatch detection failure is itself fail-open (returns false).
 * See RESEARCH.md Pitfall D.
 */
async function detectTokenMismatch(
  ghAuthLogin: string,
  envToken: string,
): Promise<boolean> {
  try {
    const { stdout } = await execa('gh', ['api', 'user', '--hostname', 'github.com'], {
      env: { ...process.env, GH_TOKEN: envToken },
    });
    const envUser = JSON.parse(stdout) as { login: string };
    return envUser.login !== ghAuthLogin;
  } catch {
    return false;  // mismatch detection itself fails open
  }
}
