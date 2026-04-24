---
status: complete
---

# Thread Thinking Indicator

Added typing dots (bouncing animation) to ThreadCard when Claude is preparing a reply to an @claude inline comment. The indicator shows when: the last turn is from `user`, no draft has been set yet (`draftBody === undefined`), and the thread isn't resolved. Uses the existing `.typing-dots` CSS from the chat panel.

**File changed:** `web/src/components/ThreadCard.tsx`
