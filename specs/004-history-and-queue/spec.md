# Spec 004: Tamper-evident history and the approval queue

## Requirements
- FR-004-01: Append-only history; each entry hashes the previous entry's hash plus its own content (SHA-256; first entry uses "GENESIS").
- FR-004-02: "Verify" recomputes the chain and reports the first broken entry.
- FR-004-03: Held actions appear in "Waiting for you" with the reason, evidence, recommendation, Release and Reject.
- FR-004-04: Each held item is raised once; approvals expire after 24 hours and are re-checked before running.
- FR-004-05: Track override rate and time to approve; warn the owner if approvals look automatic.

## Acceptance
- Verify passes on a clean history and detects a hand-edited entry.
- S3 appears in the queue with "SGD 8,040 unpaid. Recommend: no."
