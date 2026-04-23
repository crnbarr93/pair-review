/**
 * Phase 06.1 reducer tests — verifies that server/src/session/reducer.ts
 * correctly handles all 5 new Phase 06.1 SessionEvent variants.
 *
 * TDD RED: These tests fail until the 5 new case branches are added to reducer.ts.
 */
import { describe, it, expect } from 'vitest';
import { applyEvent } from '../reducer.js';
import type { ReviewSession, Thread, ChatMessage, LineSide } from '@shared/types';

function baseSession(): ReviewSession {
  return {
    prKey: 'gh:owner/repo#1',
    pr: {
      source: 'github',
      title: 'Test PR',
      description: 'Test description.',
      author: 'testuser',
      baseBranch: 'main',
      headBranch: 'feature/test',
      baseSha: 'aaa111',
      headSha: 'abc',
      additions: 10,
      deletions: 2,
      filesChanged: 2,
      number: 1,
      owner: 'owner',
      repo: 'repo',
    },
    diff: { files: [], totalHunks: 0 },
    shikiTokens: {},
    createdAt: '2026-04-22T00:00:00Z',
    headSha: 'abc',
    error: null,
    lastEventId: 0,
  };
}

describe('reducer Phase 06.1 events — chat.userMessage', () => {
  it('appends to chatMessages array with author user', () => {
    const s = baseSession();
    const out = applyEvent(s, {
      type: 'chat.userMessage',
      message: 'What does this change do?',
      timestamp: '2026-04-23T10:00:00Z',
    });
    expect(out).not.toBe(s);
    expect(out.chatMessages).toHaveLength(1);
    expect(out.chatMessages![0].author).toBe('user');
    expect(out.chatMessages![0].message).toBe('What does this change do?');
    expect(out.chatMessages![0].timestamp).toBe('2026-04-23T10:00:00Z');
  });

  it('creates new array when chatMessages is undefined', () => {
    const s = baseSession();
    expect(s.chatMessages).toBeUndefined();
    const out = applyEvent(s, {
      type: 'chat.userMessage',
      message: 'First message',
      timestamp: '2026-04-23T10:00:00Z',
    });
    expect(Array.isArray(out.chatMessages)).toBe(true);
    expect(out.chatMessages).toHaveLength(1);
  });

  it('appends to existing chatMessages', () => {
    const s: ReviewSession = {
      ...baseSession(),
      chatMessages: [
        { author: 'user', message: 'Existing', timestamp: '2026-04-23T09:00:00Z' },
      ],
    };
    const out = applyEvent(s, {
      type: 'chat.userMessage',
      message: 'Second message',
      timestamp: '2026-04-23T10:00:00Z',
    });
    expect(out.chatMessages).toHaveLength(2);
    expect(out.chatMessages![1].message).toBe('Second message');
  });
});

describe('reducer Phase 06.1 events — chat.llmMessage', () => {
  it('appends to chatMessages array with author llm', () => {
    const s = baseSession();
    const out = applyEvent(s, {
      type: 'chat.llmMessage',
      message: 'This change refactors the auth layer.',
      timestamp: '2026-04-23T10:01:00Z',
    });
    expect(out).not.toBe(s);
    expect(out.chatMessages).toHaveLength(1);
    expect(out.chatMessages![0].author).toBe('llm');
    expect(out.chatMessages![0].message).toBe('This change refactors the auth layer.');
  });

  it('creates new array when chatMessages is undefined', () => {
    const s = baseSession();
    const out = applyEvent(s, {
      type: 'chat.llmMessage',
      message: 'LLM response',
      timestamp: '2026-04-23T10:01:00Z',
    });
    expect(Array.isArray(out.chatMessages)).toBe(true);
    expect(out.chatMessages).toHaveLength(1);
  });

  it('appends after user messages preserving order', () => {
    const s: ReviewSession = {
      ...baseSession(),
      chatMessages: [
        { author: 'user', message: 'Question', timestamp: '2026-04-23T10:00:00Z' },
      ],
    };
    const out = applyEvent(s, {
      type: 'chat.llmMessage',
      message: 'Answer',
      timestamp: '2026-04-23T10:01:00Z',
    });
    expect(out.chatMessages).toHaveLength(2);
    expect(out.chatMessages![0].author).toBe('user');
    expect(out.chatMessages![1].author).toBe('llm');
  });
});

describe('reducer Phase 06.1 events — thread.userStarted', () => {
  it('creates a new thread with initiator user', () => {
    const s = baseSession();
    const out = applyEvent(s, {
      type: 'thread.userStarted',
      lineId: 'fileabc:h0:l5',
      path: 'src/auth.ts',
      line: 42,
      side: 'RIGHT' as LineSide,
      threadId: 'th_abc123',
      message: 'Why is this cast needed?',
      isClaudeTagged: false,
      timestamp: '2026-04-23T10:00:00Z',
    });
    expect(out).not.toBe(s);
    expect(out.threads).toBeDefined();
    expect(out.threads!['th_abc123']).toBeDefined();
    const thread = out.threads!['th_abc123'] as Thread;
    expect(thread.initiator).toBe('user');
  });

  it('stores lineId, path, line, side, and threadId from event', () => {
    const s = baseSession();
    const out = applyEvent(s, {
      type: 'thread.userStarted',
      lineId: 'fileabc:h0:l5',
      path: 'src/auth.ts',
      line: 42,
      side: 'RIGHT' as LineSide,
      threadId: 'th_xyz789',
      message: 'This looks suspicious',
      isClaudeTagged: true,
      timestamp: '2026-04-23T10:00:00Z',
    });
    const thread = out.threads!['th_xyz789'] as Thread;
    expect(thread.threadId).toBe('th_xyz789');
    expect(thread.lineId).toBe('fileabc:h0:l5');
    expect(thread.path).toBe('src/auth.ts');
    expect(thread.line).toBe(42);
    expect(thread.side).toBe('RIGHT');
  });

  it('creates first turn with author user and the user message', () => {
    const s = baseSession();
    const out = applyEvent(s, {
      type: 'thread.userStarted',
      lineId: 'fileabc:h0:l5',
      path: 'src/api.ts',
      line: 10,
      side: 'RIGHT' as LineSide,
      threadId: 'th_turn01',
      message: 'First turn message',
      isClaudeTagged: false,
      timestamp: '2026-04-23T10:05:00Z',
    });
    const thread = out.threads!['th_turn01'] as Thread;
    expect(thread.turns).toHaveLength(1);
    expect(thread.turns[0].author).toBe('user');
    expect(thread.turns[0].message).toBe('First turn message');
    expect(thread.turns[0].createdAt).toBe('2026-04-23T10:05:00Z');
  });

  it('sets draftBody to user message when isClaudeTagged is false (D-14)', () => {
    const s = baseSession();
    const out = applyEvent(s, {
      type: 'thread.userStarted',
      lineId: 'fileabc:h0:l5',
      path: 'src/api.ts',
      line: 10,
      side: 'RIGHT' as LineSide,
      threadId: 'th_draft01',
      message: 'This is a user note for the review',
      isClaudeTagged: false,
      timestamp: '2026-04-23T10:05:00Z',
    });
    const thread = out.threads!['th_draft01'] as Thread;
    expect(thread.draftBody).toBe('This is a user note for the review');
  });

  it('leaves draftBody undefined when isClaudeTagged is true (D-14)', () => {
    const s = baseSession();
    const out = applyEvent(s, {
      type: 'thread.userStarted',
      lineId: 'fileabc:h0:l5',
      path: 'src/api.ts',
      line: 10,
      side: 'RIGHT' as LineSide,
      threadId: 'th_claude01',
      message: '@claude What does this line do?',
      isClaudeTagged: true,
      timestamp: '2026-04-23T10:05:00Z',
    });
    const thread = out.threads!['th_claude01'] as Thread;
    expect(thread.draftBody).toBeUndefined();
  });

  it('sets preExisting to false and resolved to false', () => {
    const s = baseSession();
    const out = applyEvent(s, {
      type: 'thread.userStarted',
      lineId: 'fileabc:h1:l0',
      path: 'src/service.ts',
      line: 5,
      side: 'LEFT' as LineSide,
      threadId: 'th_flags01',
      message: 'Comment',
      isClaudeTagged: false,
      timestamp: '2026-04-23T10:10:00Z',
    });
    const thread = out.threads!['th_flags01'] as Thread;
    expect(thread.preExisting).toBe(false);
    expect(thread.resolved).toBe(false);
  });
});

describe('reducer Phase 06.1 events — request.queued', () => {
  it('increments pending count from 0 to 1', () => {
    const s = baseSession();
    const out = applyEvent(s, {
      type: 'request.queued',
      requestType: 'chat',
      position: 1,
    });
    expect(out).not.toBe(s);
    expect(out.requestQueue?.pending).toBe(1);
  });

  it('increments from existing count', () => {
    const s: ReviewSession = {
      ...baseSession(),
      requestQueue: { pending: 2 },
    };
    const out = applyEvent(s, {
      type: 'request.queued',
      requestType: 'run_self_review',
      position: 3,
    });
    expect(out.requestQueue?.pending).toBe(3);
  });

  it('initializes requestQueue when undefined', () => {
    const s = baseSession();
    expect(s.requestQueue).toBeUndefined();
    const out = applyEvent(s, {
      type: 'request.queued',
      requestType: 'chat',
      position: 1,
    });
    expect(out.requestQueue).toBeDefined();
    expect(out.requestQueue!.pending).toBe(1);
  });
});

describe('reducer Phase 06.1 events — request.processing', () => {
  it('decrements pending count', () => {
    const s: ReviewSession = {
      ...baseSession(),
      requestQueue: { pending: 2 },
    };
    const out = applyEvent(s, { type: 'request.processing' });
    expect(out).not.toBe(s);
    expect(out.requestQueue?.pending).toBe(1);
  });

  it('does not go below 0 (floor at 0)', () => {
    const s: ReviewSession = {
      ...baseSession(),
      requestQueue: { pending: 0 },
    };
    const out = applyEvent(s, { type: 'request.processing' });
    expect(out.requestQueue?.pending).toBe(0);
  });

  it('handles undefined requestQueue without error (treats pending as 0)', () => {
    const s = baseSession();
    const out = applyEvent(s, { type: 'request.processing' });
    expect(out.requestQueue?.pending).toBe(0);
  });
});

describe('reducer Phase 06.1 — purity checks', () => {
  it('all 5 new event types produce referentially new objects', () => {
    const s = baseSession();

    const r1 = applyEvent(s, {
      type: 'chat.userMessage',
      message: 'msg',
      timestamp: '2026-04-23T10:00:00Z',
    });
    expect(r1).not.toBe(s);

    const r2 = applyEvent(s, {
      type: 'chat.llmMessage',
      message: 'msg',
      timestamp: '2026-04-23T10:00:00Z',
    });
    expect(r2).not.toBe(s);

    const r3 = applyEvent(s, {
      type: 'thread.userStarted',
      lineId: 'fileabc:h0:l0',
      path: 'src/x.ts',
      line: 1,
      side: 'RIGHT' as LineSide,
      threadId: 'th_pure01',
      message: 'msg',
      isClaudeTagged: false,
      timestamp: '2026-04-23T10:00:00Z',
    });
    expect(r3).not.toBe(s);

    const r4 = applyEvent(s, {
      type: 'request.queued',
      requestType: 'chat',
      position: 1,
    });
    expect(r4).not.toBe(s);

    const r5 = applyEvent(s, { type: 'request.processing' });
    expect(r5).not.toBe(s);
  });

  it('does not mutate the original session for chat.userMessage', () => {
    const s = baseSession();
    const snapshot = JSON.stringify(s);
    applyEvent(s, {
      type: 'chat.userMessage',
      message: 'test',
      timestamp: '2026-04-23T10:00:00Z',
    });
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('does not mutate the original session for thread.userStarted', () => {
    const s = baseSession();
    const snapshot = JSON.stringify(s);
    applyEvent(s, {
      type: 'thread.userStarted',
      lineId: 'fileabc:h0:l0',
      path: 'src/x.ts',
      line: 1,
      side: 'RIGHT' as LineSide,
      threadId: 'th_immut01',
      message: 'test',
      isClaudeTagged: false,
      timestamp: '2026-04-23T10:00:00Z',
    });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
