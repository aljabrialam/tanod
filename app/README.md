# Tanod app

The live application: a Node.js server (built-ins only, no dependencies) with a vanilla-JS front end. Deployed on QwenWork Pages with a persistent database; the same code runs locally with an in-memory store.

## Run locally

```sh
node server.js            # http://localhost:8081
```

With `SUPABASE_URL` and `SUPABASE_ANON_KEY` set, it uses a Supabase-compatible REST database; without them, an in-memory store (fine for development and the test suite).

## Demo data (not redistributed)

The Lumen Studio demo workspace is built from the AvePoint track starter kit provided by the organisers. The kit is **not committed here**. To populate a local checkout:

1. Unzip `AgentsWatchingAgents_StarterKit.zip`.
2. Copy its `data/**` (except `00_README.md`) into `app/data/seed/`, removing every `sensitivity:` header line.
3. Copy `rules/policy.json`, `rules/taxonomy.json`, `rules/scenarios.json`, `rules/ground_truth_labels.json` into `app/data/rules/`.
4. Add our S8 email: copy `data/inbox/2026-11-16_harbourbean_billing_update.md` (repo root) into `app/data/seed/inbox/`.

The deployed build bundles these files; on first start the server seeds the workspace, labels every file from content, and loads the 19-rule policy template, parties and floors.

## Layout

```
server.js        HTTP server + API routes
lib/db.js        storage (Supabase REST / in-memory)
lib/seed.js      workspace seeding, onboarding helpers, demo reset
lib/classify.js  content-only sensitivity classifier
lib/policy.js    rule table, floors, price list, plain-English rule compilation
lib/facts.js     claim extraction + tracing to source lines
lib/scope.js     files-read vs task scope check
lib/engine.js    the gate: classify → wrong-client → facts → scope → policy → combine → owner line;
                 execution (simulated), checkpoints, approvals, rewind
lib/ledger.js    SHA-256 hash chain + verify
lib/repair.js    gate-checked safe options (corrected / within rules / ask first)
lib/briefing.js  daily briefing groups
lib/tests.js     S1–S9 + clean set runner and scoring
public/          front end (Today, History, Outbox, Files, Policy, Briefing, Tests, Set up, Poster)
```

## Tests

```sh
# with the server running:
curl -X POST http://localhost:8081/api/workspaces/lumen-studio/tests/run
```

Or open `/#/tests` and press "Run the suite". Measured 18 Nov 2026: 9/9 scenarios, 27/27 checks (kit 15/15), 27/27 labels, 0 false blocks on 21 clean actions.