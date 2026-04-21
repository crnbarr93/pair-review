---
phase: 04
slug: llm-summary-checklist-self-review
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-21
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| LLM args → zod inputSchema | MCP tool inputs from Claude Code session; zod validates shape, length, enum, regex | LLM-authored strings (summary, findings, verdict) |
| Finding.lineId → server-side resolution | Opaque lineId must resolve to a real line in session.diff; prevents hallucinated coordinates | lineId string → (path, line, side) tuple |
| Session state → SSE → browser DOM | LLM-authored text flows through SSE to React components; must render as text nodes | PrSummary, Finding title/rationale |
| CHECKLIST const → tool description | Static checklist ships in bundled server code; read by Claude Code via tools/list | Checklist item text + ids |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-4-01-01 | Tampering | SessionEvent union drift server/web | mitigate | Shared types.ts consumed by both; TypeScript compile enforces exhaustiveness | closed |
| T-4-01-02 | Info Disclosure | ResolvedFinding leaks internal fields | accept | All fields are review-artifact data visible via diff UI; no secrets | closed |
| T-4-01-03 | Tampering | Finding text with script-like content | mitigate | React text-node rendering; 0 innerHTML in FindingsSidebar (grep-verified) | closed |
| T-4-01-04 | Tampering | PrSummary.paraphrase rendered as HTML | mitigate | React text-node rendering; 0 innerHTML in SummaryDrawer (grep-verified) | closed |
| T-4-02-01 | Tampering | Supply-chain: TS const modified | accept | Single-user tool; code-edit attacker has arbitrary execution | closed |
| T-4-02-02 | Spoofing | Finding cites unknown checklistItemId | mitigate | Handler validates against CHECKLIST_IDS Set; unknown → isError | closed |
| T-4-02-03 | Info Disclosure | Checklist text contains sensitive info | accept | Generic code-review items; no PII/secrets/internals | closed |
| T-4-03-01 | Tampering | Reducer purity violation | mitigate | Unit tests assert new reference, lastEventId untouched; grep: 0 console.* in reducer | closed |
| T-4-03-02 | DoS | Stale event replay | accept | Atomic-replace semantics make replay idempotent; user regenerates manually | closed |
| T-4-03-03 | Info Disclosure | LLM text leaks to log via reducer | mitigate | Reducer has 0 console.* calls (grep-verified) | closed |
| T-4-03-04 | Tampering | New event breaks old snapshot | mitigate | Optional fields on ReviewSession; old snapshots deserialize cleanly | closed |
| T-4-04-01 | DoS | Oversized list_files limit | mitigate | Zod .max(50); server default 30 | closed |
| T-4-04-02 | Tampering | Malformed cursor string | mitigate | Handler try/catch; invalid → isError with corrective text | closed |
| T-4-04-03 | Injection | LLM-supplied fileId/hunkId not in session | mitigate | Handler lookups in session.diff; not found → isError | closed |
| T-4-04-04 | Info Disclosure | Generated file exposed to LLM | mitigate | includeExcluded defaults false; generated files filtered | closed |
| T-4-04-05 | DoS | Tool response > 2k tokens (Pitfall 5) | mitigate | Default limit=30; character-budget test asserts < 6000 chars | closed |
| T-4-04-06 | Tampering | prKey spoofing | accept | Single-user local tool; no multi-tenant concern | closed |
| T-4-04-07 | Spoofing | Exception becomes unrecoverable protocol error | mitigate | Every handler wraps in try/catch → isError | closed |
| T-4-05-01 | Tampering | intentConfidence outside 0-1 | mitigate | Zod .min(0).max(1) | closed |
| T-4-05-02 | DoS | Oversized summary fields | mitigate | Zod .max(2000) paraphrase, .max(400) per entry, .max(20) array | closed |
| T-4-05-03 | Injection | Paraphrase contains script content | mitigate | React text-node rendering; no innerHTML path | closed |
| T-4-05-04 | Tampering | Missing generatedAt → invalid timestamp | mitigate | Server-side coercion to new Date().toISOString() | closed |
| T-4-05-05 | Spoofing | Thrown exception → protocol error | mitigate | try/catch → isError on all paths | closed |
| T-4-05-06 | Tampering | prKey pointing at different session | accept | Single-user local tool | closed |
| T-4-06-01 | Spoofing | LLM hallucinates freeform path:line (BLOCKER — Pitfall 2) | mitigate | Zod regex `/^[A-Za-z0-9_-]+:h\d+:l\d+$/` + server-side resolution + tool description ban. Three-layer defense | closed |
| T-4-06-02 | Tampering | Nit flood (Pitfall 3) | mitigate | Zod .refine() rejects > 3 nits; corrective isError | closed |
| T-4-06-03 | Spoofing | Sycophantic verdict (Pitfall 4) | mitigate | Zod .default('request_changes'); LLM must argue DOWN | closed |
| T-4-06-04 | Tampering | Oversized rationale/title | mitigate | Zod .max(200) title, .max(2000) rationale, .max(100) findings | closed |
| T-4-06-05 | Spoofing | Unknown checklistItemId | mitigate | Handler validates against CHECKLIST_IDS; unknown → isError | closed |
| T-4-06-06 | Info Disclosure | Rationale contains sensitive content | accept | Review-artifact data; no external surface until Phase 6 | closed |
| T-4-06-07 | DoS | 100 findings × 2000-char rationale | mitigate | Zod caps; worst case ~200kB within budget | closed |
| T-4-06-08 | Spoofing | Verdict contradicts findings severity | accept | Semantic quality signal; eval concern, not security | closed |
| T-4-06-09 | Tampering | selfReview.set replay restores stale | accept | Atomic-replace idempotent; user regenerates manually | closed |
| T-4-07-01 | Tampering | LLM rationale rendered as HTML | mitigate | 0 dangerouslySetInnerHTML in FindingsSidebar/SummaryDrawer (grep-verified) | closed |
| T-4-07-02 | Tampering | file:line ref routes to external URL | mitigate | Click handler uses getElementById().scrollIntoView only; no navigation | closed |
| T-4-07-03 | Info Disclosure | Findings from different session | accept | Single-user; multi-session is Phase 7 | closed |
| T-4-07-04 | DoS | Sidebar rendering 100 findings | mitigate | Zod caps; rationale collapsed by default | closed |
| T-4-07-05 | Tampering | CSS variable conflicts | mitigate | No new -- CSS variable declarations (grep-enforced) | closed |
| T-4-08-01 | Tampering | Fixtures trigger shell-outs | mitigate | Harness uses parse-diff in-memory only; no network/shell | closed |
| T-4-08-02 | Info Disclosure | Fixtures contain secrets | accept | Hand-authored by single user; reviewed at commit | closed |
| T-4-08-03 | Tampering | Baseline JSON drift hides regression | mitigate | Baseline frozen at release tag; changes require human review | closed |
| T-4-08-04 | Spoofing | Synthesized payloads don't represent real LLM | accept | Unit-test layer; real-LLM acceptance is manual | closed |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-4-01-02 | ResolvedFinding fields are review artifacts visible via diff UI; no secrets/PII | Connor Barr | 2026-04-21 |
| AR-04-02 | T-4-02-01 | Single-user local tool; code-edit attacker has arbitrary execution | Connor Barr | 2026-04-21 |
| AR-04-03 | T-4-02-03 | Checklist is generic review discipline; no sensitive content | Connor Barr | 2026-04-21 |
| AR-04-04 | T-4-03-02 | Atomic-replace replay is idempotent; user regenerates manually | Connor Barr | 2026-04-21 |
| AR-04-05 | T-4-04-06, T-4-05-06 | Single-user local tool; no multi-tenant prKey isolation needed | Connor Barr | 2026-04-21 |
| AR-04-06 | T-4-06-06 | Review-artifact text; no external surface until Phase 6 submission | Connor Barr | 2026-04-21 |
| AR-04-07 | T-4-06-08 | Verdict/severity contradiction is eval quality, not security | Connor Barr | 2026-04-21 |
| AR-04-08 | T-4-06-09 | Atomic-replace replay; same as AR-04-04 | Connor Barr | 2026-04-21 |
| AR-04-09 | T-4-07-03 | Single-user; multi-session isolation deferred to Phase 7 | Connor Barr | 2026-04-21 |
| AR-04-10 | T-4-08-02 | Hand-authored test fixtures; reviewed at commit | Connor Barr | 2026-04-21 |
| AR-04-11 | T-4-08-04 | Synthesized payloads are unit-test layer; real-LLM is manual | Connor Barr | 2026-04-21 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-21 | 43 | 43 | 0 | Claude (inline verify) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter
