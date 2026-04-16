import { describe, it, expect } from 'vitest';
import { githubKey, localKey } from '../key.js';

describe('githubKey', () => {
  it('returns the exact canonical pr-key string', () => {
    expect(githubKey('octocat', 'hello', 42)).toBe('gh:octocat/hello#42');
  });

  it('handles different owner/repo/number values', () => {
    expect(githubKey('owner', 'repo', 1)).toBe('gh:owner/repo#1');
  });
});

describe('localKey', () => {
  it('returns a string matching local:<sha256-hex>', () => {
    const key = localKey('/tmp/repo', 'main', 'feat/x');
    expect(key).toMatch(/^local:[0-9a-f]{64}$/);
  });

  it('is deterministic — same inputs produce same key', () => {
    const key1 = localKey('/tmp/repo', 'main', 'feat/x');
    const key2 = localKey('/tmp/repo', 'main', 'feat/x');
    expect(key1).toBe(key2);
  });

  it('different repoPath produces different key', () => {
    const key1 = localKey('/tmp/repo-a', 'main', 'feat/x');
    const key2 = localKey('/tmp/repo-b', 'main', 'feat/x');
    expect(key1).not.toBe(key2);
  });

  it('different base ref produces different key', () => {
    const key1 = localKey('/tmp/repo', 'main', 'feat/x');
    const key2 = localKey('/tmp/repo', 'develop', 'feat/x');
    expect(key1).not.toBe(key2);
  });
});
