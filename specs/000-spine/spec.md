# Spec 000: Spine

**Why.** Prove the riskiest assumption first: an agent action submitted through the outbox reaches the gate, gets a decision, and lands in the history, live in QwenWork.

## User story
As the owner, when one of my agents tries to do something, I see it appear in Tanod with a decision within seconds.

## Requirements
- FR-000-01: An outbox page accepts an action (agent, task, action type, fields, files read).
- FR-000-02: The same action can be submitted as JSON to `POST /api/workspaces/{id}/actions`.
- FR-000-03: A stub gate returns ALLOW, HOLD_FOR_APPROVAL or BLOCK with a reason.
- FR-000-04: Every action and decision is written to the history.
- FR-000-05: The Today screen shows the decision live.

## Acceptance
- One action submitted by a real QwenWork agent appears on the Today screen with its decision, and in the history.
