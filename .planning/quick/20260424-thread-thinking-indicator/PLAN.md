---
slug: thread-thinking-indicator
description: Add typing dots indicator to ThreadCard when Claude is processing an @claude inline comment
model: opus
tasks: 1
---

# Thread Thinking Indicator

## Task 1: Add typing dots to ThreadCard

**What:** Show bouncing typing dots in ThreadCard when the thread's last turn is from the user and `isClaudeTagged` is true — indicating Claude is preparing a reply.

**Where:** `web/src/components/ThreadCard.tsx`

**How:**
- Check if `thread.isClaudeTagged` and the last turn's author is `'user'` (meaning Claude hasn't replied yet)
- Render the same `.typing-dots` markup used in ChatPanel after the conversation turns
- CSS already exists in index.css (`.typing-dots` with bounce animation)

**Acceptance:** After tagging @claude on a diff line, typing dots appear in the thread card until Claude's reply arrives.
