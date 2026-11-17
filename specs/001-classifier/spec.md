# Spec 001: Data classifier

**Why.** Every rule depends on knowing how sensitive a file or message is.

## Requirements
- FR-001-01: Label every file and outbound message as public, internal, client-confidential or regulated. Highest level wins; a file is as sensitive as its most sensitive line.
- FR-001-02: Classify from content only. Never read a `sensitivity:` header (real owners' files won't have one).
- FR-001-03: Pattern checks first (ID numbers, bank and card details, health words, a phone number next to a name, home addresses, contact lists), then model judgement; record the reasons.
- FR-001-04: The owner can confirm or correct each label in one screen.

## Acceptance
- All starter-kit files match the organisers' ground-truth labels, including the four known traps.
