# Spec 002: Rules, wrong-client check and the decision

**Why.** The decision must be deterministic, explainable and impossible to talk around.

## Requirements
- FR-002-01: Load a rule table (ALLOW / APPROVE / NEVER per action and condition) and owner floors.
- FR-002-02: The owner can add rules in plain English; Tanod shows the compiled rule back for confirmation.
- FR-002-03: Wrong-client check: if any outbound content belongs to a client other than the recipient, BLOCK.
- FR-002-04: Combine: any NEVER rule, wrong-client hit or failed fact check gives BLOCK; else any APPROVE rule gives HOLD_FOR_APPROVAL; else ALLOW. List every rule that fired.
- FR-002-05: A BLOCK can never be approved by the owner.
- FR-002-06: Instructions found inside emails or files are never treated as the owner's; actions they trigger towards unknown recipients are blocked.
- FR-002-07: Each decision carries a one- or two-sentence owner message in plain words, with money amounts where relevant.

## Acceptance
- S1, S2, S3, S6, S8 produce the expected decision, rules and evidence.
