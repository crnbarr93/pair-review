/**
 * Tests for start-review.ts — specifically the renderSummary + paraphrase functions.
 * These are exported for testing purposes via a test-only export pattern.
 * We test them indirectly by importing and inspecting module internals via vitest.
 */
import { describe, it, expect } from 'vitest';

// We test paraphrase and renderSummary by importing the module's test exports.
// The module needs to export these functions for testing.
// If not exported, we'll test via the full tool registration path.
import { paraphrase, renderSummaryForTest } from '../start-review.js';
import type { ReviewSession, PullRequestMeta, DiffModel } from '@shared/types';

function makeSession(overrides?: Partial<PullRequestMeta>): ReviewSession {
  const pr: PullRequestMeta = {
    source: 'local',
    title: 'Fix memory leak in diff parser',
    description: '## Overview\n\nThis PR fixes a serious memory leak in the diff parser.\n\n- Closes #123\n- Tested on large repos\n\nThe leak was caused by a missing cleanup call in the `parseHunk` function.',
    author: 'connorbarr',
    baseBranch: 'main',
    headBranch: 'fix/memory-leak',
    baseSha: 'abc123',
    headSha: 'def456',
    additions: 42,
    deletions: 18,
    filesChanged: 3,
    ...overrides,
  };
  const diff: DiffModel = { files: [], totalHunks: 0 };
  return {
    prKey: 'local:abc123',
    pr,
    diff,
    shikiTokens: {},
    createdAt: '2026-04-16T12:00:00.000Z',
    headSha: 'def456',
    error: null,
  };
}

describe('paraphrase()', () => {
  it('truncates a long multi-paragraph description to ≤280 chars', () => {
    const desc = 'A'.repeat(300);
    const result = paraphrase(desc);
    expect(result.length).toBeLessThanOrEqual(280);
    expect(result).toMatch(/\.\.\.$/);
  });

  it('strips markdown header prefix (## ) but keeps heading text', () => {
    const desc = '## Overview\n\nFixes a bug.';
    const result = paraphrase(desc);
    // The ## prefix is stripped but the heading word "Overview" remains in the first paragraph
    expect(result).not.toContain('##');
    expect(result).toContain('Overview');
  });

  it('strips markdown headers from a description whose first paragraph is a pure header line', () => {
    // When the header reduces to a non-empty word, the paraphrase uses that word.
    // To verify "Fixes a bug." is reachable, the test uses a description where first paragraph
    // is empty after stripping (e.g., a blank HTML comment).
    const desc = '<!-- ignore -->\n\nFixes a bug.';
    const result = paraphrase(desc);
    expect(result).toContain('Fixes a bug.');
  });

  it('strips markdown bullet points from description', () => {
    const desc = '- Closes #123\n- Fixes bug\n- Adds test';
    const result = paraphrase(desc);
    expect(result).not.toMatch(/^-\s/);
  });

  it('strips inline code from description', () => {
    const desc = 'Fixes `parseHunk` function to avoid memory leak.';
    const result = paraphrase(desc);
    expect(result).not.toContain('`');
    expect(result).toContain('parseHunk');
  });

  it('strips markdown links and keeps link text', () => {
    const desc = 'See [the docs](https://example.com) for details.';
    const result = paraphrase(desc);
    expect(result).not.toContain('https://example.com');
    expect(result).toContain('the docs');
  });

  it('returns placeholder text for empty string', () => {
    const result = paraphrase('');
    expect(result).toBe('(no description provided — review the changes below)');
  });

  it('returns placeholder text for whitespace-only string', () => {
    const result = paraphrase('   \n  \t  ');
    expect(result).toBe('(no description provided — review the changes below)');
  });

  it('takes only the first paragraph of multi-paragraph description', () => {
    const desc = 'First paragraph text.\n\nSecond paragraph text.\n\nThird paragraph text.';
    const result = paraphrase(desc);
    expect(result).toContain('First paragraph text.');
    expect(result).not.toContain('Second paragraph text.');
  });

  it('strips HTML comments from description', () => {
    const desc = '<!-- internal note --> Fixes a bug.';
    const result = paraphrase(desc);
    expect(result).not.toContain('<!--');
    expect(result).toContain('Fixes a bug.');
  });
});

describe('renderSummary()', () => {
  it('line 0 matches **title** by @author pattern', () => {
    const session = makeSession();
    const result = renderSummaryForTest(session, 'http://127.0.0.1:9999/?token=abc123');
    const lines = result.split('\n');
    expect(lines[0]).toMatch(/^\*\*.+\*\* by @.+$/);
  });

  it('line 1 matches base → head (+N/-M, N files) pattern', () => {
    const session = makeSession();
    const result = renderSummaryForTest(session, 'http://127.0.0.1:9999/?token=abc123');
    const lines = result.split('\n');
    expect(lines[1]).toMatch(/^.+ → .+  \(\+\d+\/-\d+, \d+ files\)$/);
  });

  it('includes a non-empty paraphrase paragraph (not raw description)', () => {
    const longDesc = '## PR Overview\n\nThis PR introduces a completely new caching layer that significantly improves performance for large repositories by reducing redundant file reads and implementing an LRU eviction strategy.\n\n## Testing\n\n- Added 15 new unit tests\n- Benchmarked on repos with 50k+ files';
    const session = makeSession({ description: longDesc });
    const result = renderSummaryForTest(session, 'http://127.0.0.1:9999/?token=abc123');
    // Should not contain the raw ## markdown headers
    expect(result).not.toContain('## PR Overview');
    expect(result).not.toContain('## Testing');
    // Should contain some text from the description
    expect(result.length).toBeGreaterThan(50);
  });

  it('final line matches "Review open at: http://127.0.0.1:<port>/?token=..." pattern', () => {
    const session = makeSession();
    const result = renderSummaryForTest(session, 'http://127.0.0.1:9999/?token=abc123def456');
    const lines = result.split('\n');
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toMatch(/^Review open at: http:\/\/127\.0\.0\.1:\d+\/\?token=.+$/);
  });

  it('uses placeholder text for empty description', () => {
    const session = makeSession({ description: '' });
    const result = renderSummaryForTest(session, 'http://127.0.0.1:9999/?token=abc123');
    expect(result).toContain('(no description provided');
  });

  it('includes has_selfReview flag when session has selfReview', () => {
    const session = makeSession();
    session.selfReview = {
      findings: [],
      coverage: { correctness: 'pass', security: 'pass', tests: 'pass', performance: 'pass', style: 'pass' },
      verdict: 'approve',
      generatedAt: '2026-04-27T00:00:00.000Z',
    };
    const result = renderSummaryForTest(session, 'http://127.0.0.1:9999/?token=abc123');
    expect(result).toContain('has_selfReview: true');
  });

  it('omits has_selfReview flag when session has no selfReview', () => {
    const session = makeSession();
    const result = renderSummaryForTest(session, 'http://127.0.0.1:9999/?token=abc123');
    expect(result).not.toContain('has_selfReview');
  });
});

describe('plugin manifest structure', () => {
  it('.claude-plugin/plugin.json exists and has required keys', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    // Resolve relative to server/ → go up to repo root
    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    const pluginJsonPath = resolve(__dirname, '../../../../../.claude-plugin/plugin.json');
    const raw = readFileSync(pluginJsonPath, 'utf-8');
    const json = JSON.parse(raw) as Record<string, unknown>;

    expect(json).toHaveProperty('name');
    expect(json).toHaveProperty('version');
    expect(json).toHaveProperty('description');
    expect(json).toHaveProperty('mcpServers');
    // mcpServers is inlined as an object so Claude Code loads the bundled
    // server unambiguously. The default `commands/` directory is auto-discovered
    // and the field is omitted from the manifest.
    const servers = json.mcpServers as Record<string, { command: string; args: string[] }>;
    expect(servers).toHaveProperty('git-review-plugin');
    expect(servers['git-review-plugin'].command).toBe('node');
    expect(servers['git-review-plugin'].args[0]).toContain('${CLAUDE_PLUGIN_ROOT}');
    expect(servers['git-review-plugin'].args[0]).toContain('server/dist/index.js');
  });

  it('no separate .mcp.json at repo root (inlined in plugin.json)', async () => {
    const { existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    const repoRoot = resolve(__dirname, '../../../../../');
    const mcpJsonPath = resolve(repoRoot, '.mcp.json');
    const nestedMcpPath = resolve(repoRoot, '.claude-plugin/.mcp.json');

    // Both must NOT exist — the canonical location is inlined into plugin.json.
    // This avoids the merge-ambiguity case where Claude Code sees the same
    // server name from two sources and silently drops one.
    expect(existsSync(mcpJsonPath)).toBe(false);
    expect(existsSync(nestedMcpPath)).toBe(false);
  });

  it('commands/pair-review.md exists at repo root, NOT inside .claude-plugin/commands/', async () => {
    const { existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    const repoRoot = resolve(__dirname, '../../../../../');

    expect(existsSync(resolve(repoRoot, 'commands/pair-review.md'))).toBe(true);
    expect(existsSync(resolve(repoRoot, '.claude-plugin/commands'))).toBe(false);
    // Defensive: a bare /review name collides with the user's other globally-installed
    // review skills/commands. Asserting the rename keeps that hard-won fix from regressing.
    expect(existsSync(resolve(repoRoot, 'commands/review.md'))).toBe(false);
  });

  it('commands/pair-review.md has YAML frontmatter and references the namespaced MCP tool', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    const repoRoot = resolve(__dirname, '../../../../../');
    const content = readFileSync(resolve(repoRoot, 'commands/pair-review.md'), 'utf-8');

    expect(content).toContain('description:');
    expect(content).toContain('argument-hint:');
    expect(content).toContain('mcp__git-review-plugin__start_review');
    expect(content).toContain('allowed-tools:');
    expect(content).toContain('$ARGUMENTS');
  });
});
