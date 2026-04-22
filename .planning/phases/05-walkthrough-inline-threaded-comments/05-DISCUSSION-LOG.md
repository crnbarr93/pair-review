# Phase 5: Walkthrough + Inline Threaded Comments - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 05-walkthrough-inline-threaded-comments
**Areas discussed:** Walkthrough narrative flow, Show-all toggle mechanics, Thread-to-comment flattening, Inline thread UI placement

---

## Walkthrough Narrative Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Hunk-level steps | Each walkthrough step maps to one hunk. LLM can reorder hunks across files. | ✓ |
| File-level steps | Each step maps to one file (all its hunks shown together). | |
| Logical-group steps | LLM groups related hunks across files into named logical units. | |

**User's choice:** Hunk-level steps
**Notes:** Matches ROADMAP language ("hunk-by-hunk") and success criteria.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only preview + skip | LLM proposes ordered list; user can see and skip steps but not reorder. Ask Claude to revise. | ✓ |
| Drag-to-reorder UI | Full drag-and-drop reorder on the step list. | |
| Accept or reject only | Binary accept or ask Claude to redo. | |

**User's choice:** Read-only preview + skip
**Notes:** Satisfies the "change this order?" affordance from ROADMAP success criterion 1.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Banner above hunk | Commentary card directly above the hunk in the diff view. | ✓ |
| Side panel | Commentary in a dedicated right-side panel. | |
| Inline annotation | Line-level annotations within the hunk. | |

**User's choice:** Banner above hunk
**Notes:** Scrolls with the diff; clear spatial relationship to the code.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic set_walkthrough | One tool call with full walkthrough plan. | ✓ |
| Incremental add_step / finalize | Multiple tool calls to build the walkthrough. | |

**User's choice:** Atomic set_walkthrough
**Notes:** Matches Phase 4's run_self_review atomic pattern.

---

## Show-all Toggle Mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Interleaved by file position | Non-curated hunks appear in natural file position; curated hunks get visual badge. | ✓ |
| Curated first, then remainder | Curated hunks in LLM order at top, divider, then remaining below. | |
| Sidebar filter toggle | FileExplorer toggle between "Curated only" and "All files". | |

**User's choice:** Interleaved by file position
**Notes:** Walkthrough is a highlight layer on the full diff, not a separate view.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Snap to current step | Toggling back scrolls to current or next unvisited curated step. | ✓ |
| Stay at scroll position | View stays at current scroll position. | |

**User's choice:** Snap to current step
**Notes:** Clean re-entry to the guided flow.

---

## Thread-to-Comment Flattening

| Option | Description | Selected |
|--------|-------------|----------|
| LLM synthesizes, user edits | LLM produces synthesized post body; user can revise in editable field. | ✓ |
| User writes from scratch | Thread is scratchpad only; user manually writes final comment. | |
| Last LLM message becomes comment | Final LLM reply used as posted comment body. | |

**User's choice:** LLM synthesizes, user edits
**Notes:** Hybrid control — LLM does grunt work, user has final say.

---

| Option | Description | Selected |
|--------|-------------|----------|
| On explicit 'draft comment' action | Thread flows freely; LLM calls draft_comment when done. | ✓ |
| Auto-synthesize after each LLM reply | Post-body slot always shows live synthesis, updated per turn. | |

**User's choice:** On explicit 'draft comment' action
**Notes:** Avoids churn of re-synthesizing after every turn.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Always conversational | Every thread requires at least one LLM turn. LLM initiates. | ✓ |
| User can start solo threads | User can type comments directly without LLM involvement. | |

**User's choice:** Always conversational
**Notes:** Enforces the pair-review model — LLM is always part of the conversation.

---

| Option | Description | Selected |
|--------|-------------|----------|
| LLM initiates via MCP tool | LLM calls reply_in_thread to start threads. User asks Claude in chat for specific lines. | ✓ |
| User clicks line, types prompt | User clicks diff line, types question, LLM responds. | |
| Either can initiate | Both paths work. | |

**User's choice:** LLM initiates via MCP tool
**Notes:** Matches the "LLM is the co-reviewer driving the walkthrough" model.

---

## Inline Thread UI Placement

| Option | Description | Selected |
|--------|-------------|----------|
| In-diff below the line | GitHub PR review style; thread card inserts between diff lines. | ✓ |
| Right-side panel | Thread opens in dedicated right panel. | |
| Popover anchored to line | Floating popover attached to diff line. | |

**User's choice:** In-diff below the line
**Notes:** Most natural for code review; spatially tied to the code.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Push down | Thread card inserts between lines, pushing subsequent lines down. GitHub-style. | ✓ |
| Overlay with scroll offset | Thread floats over diff with offset. | |

**User's choice:** Push down
**Notes:** Diff reflows naturally.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Both live simultaneously | FindingsSidebar stays open; threads are in-diff. No conflict. | ✓ |
| Thread replaces sidebar | FindingsSidebar hides when thread active. | |
| Sidebar shows active thread | FindingsSidebar transforms to show thread content. | |

**User's choice:** Both live simultaneously
**Notes:** User can reference findings while discussing in a thread.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Multiple simultaneous | Several thread cards can be expanded at once. | ✓ |
| One at a time | Opening a thread auto-collapses others. | |

**User's choice:** Multiple simultaneous
**Notes:** Flexibility for cross-referencing between threads on related code.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Collapse older turns | Only last 2-3 turns visible; older behind "N earlier messages" expander. | ✓ |
| Scrollable card with max height | Card becomes internally scrollable past a max height. | |
| Unlimited height | Card grows as tall as the conversation. | |

**User's choice:** Collapse older turns
**Notes:** Keeps card compact; post-body slot stays visible at bottom.

---

## Claude's Discretion

- Exact type shapes for Walkthrough, Thread, DraftComment
- Whether resolve_thread is separate tool or flag on draft_comment
- Commentary banner and thread card styling
- Curated badge visual treatment
- Number of visible turns before collapsing (2-3 guidance)
- Post-body slot styling
- Walkthrough step list UI placement
- `c` keyboard shortcut integration
- threadId format
- reply_in_thread schema shape (lineId for new vs threadId for existing)

## Deferred Ideas

- Drag-to-reorder walkthrough steps — future phase if daily use demands it
- User-initiated solo threads — Phase 7 if friction observed
- Auto-synthesis after each LLM reply — rejected for churn
- Suggestion blocks in comments — v2 (DIFF-V2-03)
- Multi-line comment ranges — v2 (DIFF-V2-01)
