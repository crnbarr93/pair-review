import { describe, it, expect } from 'vitest';
import { threadToOctokitComment, collectPostableThreads } from '../anchor.js';
import type { Thread } from '@shared/types';

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    threadId: 'thread-1',
    lineId: 'file1:h0:l0',
    path: 'src/foo.ts',
    line: 42,
    side: 'RIGHT',
    preExisting: false,
    turns: [],
    draftBody: 'This looks problematic.',
    resolved: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('threadToOctokitComment', () => {
  it('maps path, line, and body correctly for RIGHT side', () => {
    const thread = makeThread({ path: 'src/auth.ts', line: 10, side: 'RIGHT', draftBody: 'Check this' });
    const comment = threadToOctokitComment(thread);
    expect(comment.path).toBe('src/auth.ts');
    expect(comment.line).toBe(10);
    expect(comment.body).toBe('Check this');
    expect(comment.side).toBe('RIGHT');
  });

  it('maps LEFT side correctly', () => {
    const thread = makeThread({ side: 'LEFT' });
    const comment = threadToOctokitComment(thread);
    expect(comment.side).toBe('LEFT');
  });

  it('maps BOTH side to RIGHT (Pitfall F — context lines anchor on post-image side)', () => {
    const thread = makeThread({ side: 'BOTH' });
    const comment = threadToOctokitComment(thread);
    expect(comment.side).toBe('RIGHT');
  });

  it('returns empty string body when draftBody is undefined', () => {
    const thread = makeThread({ draftBody: undefined });
    const comment = threadToOctokitComment(thread);
    expect(comment.body).toBe('');
  });

  it('always returns position: undefined (Pitfall A — never position)', () => {
    const thread = makeThread();
    const comment = threadToOctokitComment(thread);
    expect(comment.position).toBeUndefined();
  });

  it('preserves multi-line draftBody verbatim', () => {
    const body = 'Line one\nLine two\n\nLine four';
    const thread = makeThread({ draftBody: body });
    const comment = threadToOctokitComment(thread);
    expect(comment.body).toBe(body);
  });
});

describe('collectPostableThreads', () => {
  it('filters out threads without draftBody', () => {
    const threads: Record<string, Thread> = {
      a: makeThread({ threadId: 'a', draftBody: 'has body' }),
      b: makeThread({ threadId: 'b', draftBody: undefined }),
    };
    const postable = collectPostableThreads(threads);
    expect(postable).toHaveLength(1);
    expect(postable[0]!.threadId).toBe('a');
  });

  it('filters out resolved threads', () => {
    const threads: Record<string, Thread> = {
      a: makeThread({ threadId: 'a', draftBody: 'body', resolved: true }),
      b: makeThread({ threadId: 'b', draftBody: 'other body', resolved: false }),
    };
    const postable = collectPostableThreads(threads);
    expect(postable).toHaveLength(1);
    expect(postable[0]!.threadId).toBe('b');
  });

  it('returns empty array for empty threads object', () => {
    const postable = collectPostableThreads({});
    expect(postable).toEqual([]);
  });

  it('returns all eligible threads when multiple qualify', () => {
    const threads: Record<string, Thread> = {
      a: makeThread({ threadId: 'a', draftBody: 'body a', resolved: false }),
      b: makeThread({ threadId: 'b', draftBody: 'body b', resolved: false }),
      c: makeThread({ threadId: 'c', draftBody: undefined }),
      d: makeThread({ threadId: 'd', draftBody: 'body d', resolved: true }),
    };
    const postable = collectPostableThreads(threads);
    expect(postable).toHaveLength(2);
    const ids = postable.map((t) => t.threadId).sort();
    expect(ids).toEqual(['a', 'b']);
  });
});
