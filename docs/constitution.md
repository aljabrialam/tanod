# Constitution: Tanod

**Version:** 1.0.0
**Scope:** QwenWork x Hashmeta AI OPC Hackathon entry. **Submission 23 Nov 2026. Freeze 22 Nov 2026, 12:00 SGT.**

## Article I: Demo primacy
The deliverables are a live app built in QwenWork, a 60-second generated briefing video, and a demo video. Every task answers one question: does this change what the judges see?

## Article II: Specification first
Each feature has a spec in `specs/` before it is built: what and why, user-visible behaviour, acceptance scenarios.

## Article III: The spine rule
The riskiest assumption: **an agent action submitted through the outbox reaches the gate, gets a decision, and lands in the history, live in QwenWork.** It is proven before any other feature work.

## Article IV: Nothing is invented
Only QwenWork capabilities observed working on our account are used, and each is recorded in `docs/capability-map.md`. No invented numbers or screens. Replays and mock data are labelled.

## Article V: Deterministic decisions
The model may extract claims, propose labels and write explanations. The final allow / hold / block is computed by code from the rule table. A "never" rule cannot be overridden by any model output or by an owner approval.

## Article VI: Vertical slices
There is always one working path from agent action to visible decision. Build thin end to end, then thicken.

## Article VII: Traceability
Every demo beat maps to a requirement, every requirement to a test scenario (S1 to S9 and the clean set). Unmapped means not done.

## Article VIII: Plain language
Every message the owner sees must be understandable by a non-technical person in one read. Rule codes are labels, never the explanation.

## Article IX: Gates
| Gate | Passes when |
|---|---|
| G1 Scope | Specs and the demo script are written; the spine is identified |
| G2 Spine | One action travels outbox, gate, history, visible decision, live |
| G3 Freeze | All scenarios pass twice in a row; numbers recorded |

## Article X: Living documentation
README, `docs/gates.md` and `docs/capability-map.md` are updated at every gate.
