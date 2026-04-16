import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// We'll re-import after stubbing env so the module-level warnedOnce doesn't bleed
// across tests. Instead we spy on logger.warn.
let stateFilePath: (prKey: string) => string;
let loggerMod: { logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } };

describe('stateFilePath', () => {
  beforeEach(async () => {
    // Reset module registry so warnedOnce resets between tests
    vi.resetModules();
    // Re-import modules fresh each test
    loggerMod = await import('../../../logger.js');
    const pathsMod = await import('../paths.js');
    stateFilePath = pathsMod.stateFilePath;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns path under CLAUDE_PLUGIN_DATA when env is set', () => {
    vi.stubEnv('CLAUDE_PLUGIN_DATA', '/tmp/foo');
    // Re-import after env stub
    vi.resetModules();
    // Use a direct dynamic require pattern — but since we're ESM, use a stub approach
    // by stubbing the env before the module loads
    const result = stateFilePath('gh:o/r#1');
    // gh:o/r#1 → sanitize: gh_o_r_1
    expect(result).toBe('/tmp/foo/reviews/gh_o_r_1/state.json');
  });

  it('sanitizes slashes, colons, and hashes in pr-key', () => {
    vi.stubEnv('CLAUDE_PLUGIN_DATA', '/tmp/base');
    const result = stateFilePath('gh:owner/repo#42');
    expect(result).toBe('/tmp/base/reviews/gh_owner_repo_42/state.json');
  });

  it('falls back to .planning/.cache when CLAUDE_PLUGIN_DATA is unset and logs a warning', () => {
    vi.stubEnv('CLAUDE_PLUGIN_DATA', undefined as unknown as string);
    delete process.env.CLAUDE_PLUGIN_DATA;

    const warnSpy = vi.spyOn(loggerMod.logger, 'warn').mockImplementation(() => true);

    const result = stateFilePath('gh:o/r#1');

    expect(result).toContain('reviews/gh_o_r_1/state.json');
    expect(result).toContain('.planning');
    // Warning should have been emitted
    expect(warnSpy).toHaveBeenCalled();
  });
});
