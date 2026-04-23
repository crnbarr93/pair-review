/**
 * Phase 06.1 type surface tests — verifies that shared/types.ts exports the complete
 * Phase 06.1 type surface: ChatMessage, ChatMessageAuthor types, Thread.initiator field,
 * 5 new SessionEvent variants, and ReviewSession field extensions.
 *
 * TDD RED: These tests fail until the types are added to shared/types.ts.
 */
import { describe, it, expect } from 'vitest';
import type {
  ChatMessageAuthor,
  ChatMessage,
  Thread,
  SessionEvent,
  ReviewSession,
  LineSide,
} from '@shared/types';

// ---------------------------------------------------------------------------
// Helper: compile-time type assertion utility
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function assertType<T>(_value: T): void {
  // compile-time only — no runtime assertion needed
}

// ---------------------------------------------------------------------------
// 1. ChatMessageAuthor type
// ---------------------------------------------------------------------------
describe('ChatMessageAuthor', () => {
  it('accepts user and llm values', () => {
    const userAuthor: ChatMessageAuthor = 'user';
    const llmAuthor: ChatMessageAuthor = 'llm';
    expect(userAuthor).toBe('user');
    expect(llmAuthor).toBe('llm');
  });
});

// ---------------------------------------------------------------------------
// 2. ChatMessage interface shape
// ---------------------------------------------------------------------------
describe('ChatMessage', () => {
  it('has author, message, and timestamp fields', () => {
    const msg: ChatMessage = {
      author: 'user',
      message: 'Hello, Claude!',
      timestamp: '2026-04-23T10:00:00Z',
    };
    assertType<ChatMessage>(msg);
    expect(msg.author).toBe('user');
    expect(msg.message).toBe('Hello, Claude!');
    expect(typeof msg.timestamp).toBe('string');
  });

  it('accepts llm as author', () => {
    const msg: ChatMessage = {
      author: 'llm',
      message: 'Here is my analysis...',
      timestamp: '2026-04-23T10:01:00Z',
    };
    assertType<ChatMessage>(msg);
    expect(msg.author).toBe('llm');
  });
});

// ---------------------------------------------------------------------------
// 3. Thread interface — Phase 06.1 initiator field (D-16)
// ---------------------------------------------------------------------------
describe('Thread.initiator field (D-16)', () => {
  it('Thread interface accepts optional initiator field', () => {
    const threadWithInitiator: Thread = {
      threadId: 'th_abc123',
      lineId: 'fileabc:h0:l5',
      path: 'src/api.ts',
      line: 42,
      side: 'RIGHT' as LineSide,
      preExisting: false,
      initiator: 'user',
      turns: [],
      resolved: false,
      createdAt: '2026-04-23T10:00:00Z',
    };
    assertType<Thread>(threadWithInitiator);
    expect(threadWithInitiator.initiator).toBe('user');
  });

  it('Thread still works without initiator (backward compat)', () => {
    const threadWithoutInitiator: Thread = {
      threadId: 'th_def456',
      lineId: 'fileabc:h0:l10',
      path: 'src/api.ts',
      line: 55,
      side: 'RIGHT' as LineSide,
      preExisting: false,
      turns: [],
      resolved: false,
      createdAt: '2026-04-23T10:00:00Z',
    };
    assertType<Thread>(threadWithoutInitiator);
    expect(threadWithoutInitiator.initiator).toBeUndefined();
  });

  it('Thread initiator accepts llm value', () => {
    const llmThread: Thread = {
      threadId: 'th_llm001',
      lineId: 'fileabc:h1:l3',
      path: 'src/service.ts',
      line: 10,
      side: 'RIGHT' as LineSide,
      preExisting: false,
      initiator: 'llm',
      turns: [],
      resolved: false,
      createdAt: '2026-04-23T10:00:00Z',
    };
    assertType<Thread>(llmThread);
    expect(llmThread.initiator).toBe('llm');
  });
});

// ---------------------------------------------------------------------------
// 4. SessionEvent union — Phase 06.1 variants (D-20)
// ---------------------------------------------------------------------------
describe('SessionEvent Phase 06.1 variants', () => {
  it('chat.userMessage variant has message and timestamp', () => {
    const event: SessionEvent = {
      type: 'chat.userMessage',
      message: 'What does this change do?',
      timestamp: '2026-04-23T10:00:00Z',
    };
    assertType<SessionEvent>(event);
    expect(event.type).toBe('chat.userMessage');
  });

  it('chat.llmMessage variant has message and timestamp', () => {
    const event: SessionEvent = {
      type: 'chat.llmMessage',
      message: 'This change refactors the authentication layer...',
      timestamp: '2026-04-23T10:01:00Z',
    };
    assertType<SessionEvent>(event);
    expect(event.type).toBe('chat.llmMessage');
  });

  it('thread.userStarted variant has all required fields', () => {
    const event: SessionEvent = {
      type: 'thread.userStarted',
      lineId: 'fileabc:h0:l5',
      path: 'src/auth.ts',
      line: 42,
      side: 'RIGHT' as LineSide,
      threadId: 'th_xyz789',
      message: '@claude What does this line do?',
      isClaudeTagged: true,
      timestamp: '2026-04-23T10:02:00Z',
    };
    assertType<SessionEvent>(event);
    expect(event.type).toBe('thread.userStarted');
  });

  it('request.queued variant has requestType and position', () => {
    const event: SessionEvent = {
      type: 'request.queued',
      requestType: 'chat',
      position: 1,
    };
    assertType<SessionEvent>(event);
    expect(event.type).toBe('request.queued');
  });

  it('request.processing variant has no required payload', () => {
    const event: SessionEvent = {
      type: 'request.processing',
    };
    assertType<SessionEvent>(event);
    expect(event.type).toBe('request.processing');
  });
});

// ---------------------------------------------------------------------------
// 5. ReviewSession Phase 06.1 field extensions (D-21)
// ---------------------------------------------------------------------------
describe('ReviewSession Phase 06.1 fields', () => {
  it('accepts chatMessages optional field', () => {
    const session: ReviewSession = {
      prKey: 'gh:o/r#1',
      pr: {
        source: 'github',
        title: 'Test PR',
        description: '',
        author: 'testuser',
        baseBranch: 'main',
        headBranch: 'feature',
        baseSha: 'aaa',
        headSha: 'bbb',
        additions: 0,
        deletions: 0,
        filesChanged: 0,
      },
      diff: { files: [], totalHunks: 0 },
      shikiTokens: {},
      createdAt: '2026-04-23T10:00:00Z',
      headSha: 'bbb',
      error: null,
      lastEventId: 0,
      // Phase 06.1 additions:
      chatMessages: [
        { author: 'user', message: 'Hello', timestamp: '2026-04-23T10:00:00Z' },
        { author: 'llm', message: 'Hi!', timestamp: '2026-04-23T10:00:01Z' },
      ],
      requestQueue: { pending: 0 },
    };
    assertType<ReviewSession>(session);
    expect(session.chatMessages).toHaveLength(2);
    expect(session.requestQueue?.pending).toBe(0);
  });

  it('accepts ReviewSession without Phase 06.1 fields (backward compat)', () => {
    const session: ReviewSession = {
      prKey: 'gh:o/r#2',
      pr: {
        source: 'github',
        title: 'Old PR',
        description: '',
        author: 'testuser',
        baseBranch: 'main',
        headBranch: 'feature',
        baseSha: 'ccc',
        headSha: 'ddd',
        additions: 0,
        deletions: 0,
        filesChanged: 0,
      },
      diff: { files: [], totalHunks: 0 },
      shikiTokens: {},
      createdAt: '2026-04-20T00:00:00Z',
      headSha: 'ddd',
      error: null,
      lastEventId: 0,
    };
    assertType<ReviewSession>(session);
    expect(session.chatMessages).toBeUndefined();
    expect(session.requestQueue).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Plain-JSON discipline
// ---------------------------------------------------------------------------
describe('Plain-JSON discipline for Phase 06.1 types', () => {
  it('ChatMessage.timestamp is a string, not a Date', () => {
    const msg: ChatMessage = {
      author: 'user',
      message: 'test',
      timestamp: new Date().toISOString(),  // ISO string, not Date object
    };
    expect(typeof msg.timestamp).toBe('string');
  });
});
