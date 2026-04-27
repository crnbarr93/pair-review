---
status: complete
---

# Quick Task 260427-e7o: Add review findings as line comments + succinct summary

## Changes

### Self-review findings posted as inline GitHub comments
- Added `findingToOctokitComment()` in `server/src/submit/anchor.ts` — converts each finding to a GitHub comment with `**[SEVERITY] title**\n\nrationale` body format
- Added `collectPostableFindings()` — deduplicates findings against threads sharing the same lineId (thread comments take priority since they contain user's own words)
- Updated `submitGithubReview()` in `octokit-submit.ts` to merge thread comments + finding comments into a single `createReview` API call
- Updated `confirm-submit.ts` to pass `session.selfReview.findings` for both GitHub and local export paths
- Updated `markdown-export.ts` to include a "Self-Review Findings" section with deduplicated findings

### Concise verdict-focused review summary
- Updated the "Generate with Claude" prompt to request 3-5 sentences focused on verdict reasoning, critical findings, and remaining concerns — instead of listing every finding

### Submit modal shows combined comment count
- Renamed "THREADS TO POST" to "INLINE COMMENTS TO POST" showing combined thread + finding count
- Findings without a matching thread appear in the list with severity badge and title preview
- Findings with a matching postable thread are excluded (dedup)

## Files Modified
- `server/src/submit/anchor.ts` — new exports: `findingToOctokitComment`, `collectPostableFindings`
- `server/src/submit/octokit-submit.ts` — `findings` added to `SubmitParams`, merged into comments array
- `server/src/http/routes/confirm-submit.ts` — passes findings to both GitHub and local paths
- `server/src/submit/markdown-export.ts` — optional `findings` field, "Self-Review Findings" section
- `web/src/components/SubmitModal.tsx` — new prompt, combined inline comments list
