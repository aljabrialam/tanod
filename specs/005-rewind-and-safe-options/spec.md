# Spec 005: Rewind and safe options

**Why.** Saying no isn't enough; the owner needs a way forward and a way back.

## Requirements
- FR-005-01: Save a checkpoint before every action (affected files, outbox, queue, history head).
- FR-005-02: The owner can rewind to any checkpoint; reversible effects are restored; irreversible ones are listed with a correction draft. A rewind is itself a history entry.
- FR-005-03: On BLOCK or HOLD, generate 2 or 3 candidate continuations (corrected facts, within the rules, ask first) from the checkpoint before the risky step.
- FR-005-04: Each candidate passes through the full gate; only passing candidates are shown.
- FR-005-05: The owner picks one to run; the others are kept in the history as discarded.

## Acceptance
- S4 offers a corrected reply using only sourced figures; one tap sends it.
- S2 offers a counter at the floor and a polite decline; neither goes below the floor.
- A released deletion can be rewound and the files return.
