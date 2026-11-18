# Gates

One row per gate at the moment it passes. Each gate is also a git tag.

| Gate | Time (SGT) | Status | Evidence |
|---|---|---|---|
| G1 Scope | 2026-11-17 | passed | Specs 000 to 007 drafted; demo script drafted; spine named in the constitution |
| G2 Spine | 2026-11-18 | passed | Action submitted via Outbox and via `POST /api/workspaces/lumen-studio/actions` reaches the gate, gets a decision, lands in the hash-chained history, visible on Today — live at https://ayea3dar.qwenwork.page |
| Spec 001 Classifier | 2026-11-18 | passed | 27/27 ground-truth labels from content only (headers stripped), all four traps included; S8 file labels internal |
| Spec 002 Rules & gate | 2026-11-18 | passed | S1, S2, S3, S6, S8 expected decision + rules + evidence; BLOCK cannot be approved; injection check fires on S8 |
| Spec 003 Fact & scope | 2026-11-18 | passed | S4 flags 25% / 5 days / 5,250 against 20% / two days / 5,040 with source files; S5 holds the order and reports three out-of-scope regulated reads |
| Spec 004 History & queue | 2026-11-18 | passed | Chain verifies (0 broken); hand-edited entry detected at its seq; S3 in queue with "SGD 8,040 outstanding… Recommend: no."; 24h expiry + re-check on release |
| Spec 005 Rewind & options | 2026-11-18 | passed | Released delete rewound, file restored, rewind is its own ledger entry; S2/S4/S5/S6/S8 each show gate-passing options; merging the S4 corrected reply executes it |
| Spec 006 Briefing page | 2026-11-18 | passed | Grouped lines (Needs you / Stopped / You should know / Routine), each opens evidence; no rule codes. Narrated video: production step, pending |
| Spec 007 Onboarding & runner | 2026-11-18 | passed | Fresh workspace created via API + file upload + auto-labels + party extraction; runner: 9/9 scenarios, 27/27 checks (kit 15/15), 27/27 labels, 0 false blocks on 21 clean actions; suite re-runs on rule change |
| G3 Freeze | | pending | Requires two consecutive full passes + live worker-agent run + videos |

All measurements above: built-in test runner, 18 Nov 2026, deterministic engine (no LLM in the runtime). Execution is simulated (test outbox, soft deletes).