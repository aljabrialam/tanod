# Capability map

Every QwenWork (and other platform) capability Tanod relies on, recorded only after it has been observed working on our account. Nothing is used before it appears here.

| Capability | How we used it | Observed result | Date | Consequence for the design |
|---|---|---|---|---|
| Build and deploy a live web app | Published Tanod as a dynamic QW Page | Live at https://ayea3dar.qwenwork.page (V1 spine, V2 full build) | 2026-11-18 | No external hosting needed |
| App backend and storage | Node.js runtime + provisioned Page database (Supabase-compatible REST) | HTTP endpoints work; actions, ledger, approvals persist across refresh and redeploy | 2026-11-18 | No external API needed; server reads injected env config, never exposes credentials |
| Schema migrations | Idempotent SQL applied via the controlled migration tool | 12 tables + label/decision columns created | 2026-11-18 | Ledger, queue, checkpoints, branches all database-backed |
| Agents using browser automation on a deployed app | Not yet exercised live | pending | | Fallback ready: HTTP endpoint + test-runner replay, labelled "replay" |
| Cloud-scheduled tasks | Not yet exercised for the briefing | pending | | Needed for the daily 6pm briefing video |
| Video and audio generation | Not yet exercised for the briefing | pending | | Needed for the 60-second briefing video |
| Local acceptance testing | Ran the full suite against the real engine before publishing | 9/9 scenarios, 27/27 checks, 27/27 labels, 0/21 false blocks; chain verify + tamper detection; release/rewind/merge flows | 2026-11-18 | Numbers in README and poster come from this runner, never invented |