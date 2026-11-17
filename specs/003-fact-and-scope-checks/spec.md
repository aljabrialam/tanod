# Spec 003: Fact check and scope check

**Why.** Made-up numbers and quiet over-reading are the failures nobody sees.

## Requirements
- FR-003-01: Extract every figure, percentage, date, duration, amount and commitment from outbound text.
- FR-003-02: Mark each claim supported, contradicted (with the real value and its file) or unsupported.
- FR-003-03: Any contradicted or unsupported claim to a client is a BLOCK, listing each claim.
- FR-003-04: Compare files read against the task; mark each read in scope, arguably in scope or out of scope.
- FR-003-05: Out-of-scope reads of regulated files are reported in the briefing even when nothing was sent.

## Acceptance
- S4 flags 25%, 5 days and 5,250 with 20%, 24 Sep and 5,040 and their sources.
- S5 holds the order and reports the three out-of-scope reads.
