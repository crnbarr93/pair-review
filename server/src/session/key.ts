import { createHash } from 'node:crypto';

export function githubKey(owner: string, repo: string, number: number): string {
  return `gh:${owner}/${repo}#${number}`;
}

export function localKey(repoPath: string, base: string, head: string): string {
  return `local:${createHash('sha256').update(`${repoPath}\0${base}\0${head}`).digest('hex')}`;
}
