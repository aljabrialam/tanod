<p align="center">
  <img src="docs/brand/logo-horizontal.png" alt="Tanod: a gate arch with a check passing through it, on a lime tile" width="420">
</p>

<p align="center">
<img src="https://img.shields.io/badge/status-live-12805C?style=flat-square" alt="Status: live">
<img src="https://img.shields.io/badge/QwenWork%20x%20Hashmeta%20OPC%20Hackathon-2026%20%C2%B7%20AvePoint%20track-2B47C9?style=flat-square" alt="QwenWork x Hashmeta One-Person Company Hackathon 2026, AvePoint track">
<img src="https://img.shields.io/badge/scenarios%20caught-9%2F9-12805C?style=flat-square" alt="Rogue scenarios caught: 9 of 9">
<img src="https://img.shields.io/badge/checks%20passed-27%2F27-12805C?style=flat-square" alt="Checks passed: 27 of 27">
<img src="https://img.shields.io/badge/false%20blocks-0%2F21-12805C?style=flat-square" alt="False blocks on clean work: 0 of 21">
<img src="https://img.shields.io/badge/runtime%20dependencies-0-12805C?style=flat-square" alt="Zero runtime dependencies">
<img src="https://img.shields.io/badge/license-MIT-2B47C9?style=flat-square" alt="MIT">
</p>

<p align="center">
<a href="https://youtu.be/XmI43zjAeo0"><img src="https://img.shields.io/badge/watch%20the%20demo-2%3A58-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="Watch the 2:58 demo on YouTube"></a>
<a href="https://ayea3dar.qwenwork.page/"><img src="https://img.shields.io/badge/open%20the%20live%20app-ayea3dar.qwenwork.page-0866FF?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Open the live app"></a>
</p>

<h3 align="center">Your agents draft. Tanod decides what leaves.</h3>

**Tanod is the oversight gate between a solo business owner's AI agents and the outside world.** The agents keep drafting emails, quotes, uploads and deletions, but nothing they draft can leave until Tanod checks it against the owner's files and rules and gives one of three answers, each with a one-line reason in plain words: **allowed**, **waiting for you**, or **blocked**. When it blocks, it offers a safe corrected version that already passed the same checks. When you approve by mistake, you rewind. Every decision lands in a history that cannot be quietly edited, and in a daily briefing written for a non-technical owner.

<p align="center">
<a href="https://youtu.be/XmI43zjAeo0"><img src="docs/screenshots/studio.png" alt="Tanod Studio: a rogue day at a solo business, every action decided by the real gate" width="100%"></a><br>
<sub><b><a href="https://youtu.be/XmI43zjAeo0">Watch the demo on YouTube</a></b> (2:58, unlisted, captions): a normal day and a rogue day, four catches, a rewind, the briefing, then one real action shown input → process → output and the guardrail logic, animated.</sub>
</p>

> **Status (18 Nov 2026): live at [ayea3dar.qwenwork.page](https://ayea3dar.qwenwork.page/).** Real gate, real history, real queue, real API (three QwenWork agents used it). Simulated, and labelled as such: the Studio worker agents and execution (test outbox, soft deletes restorable 30 days). Still in production: the 60-second briefing video.

**In a hurry? Start here:** [30-second version](#the-30-second-version) → [hackathon checklist](#hackathon-checklist) → [see it](#see-it) → [how the gate decides](#how-the-gate-decides) → [guardrails](#guardrails) → [try it in two minutes](#for-judges-try-it-in-two-minutes) → [results](#results) → [production plan](#from-hackathon-to-production) → [all documents](#documentation)

---

## The 30-second version

| | |
|---|---|
| **What** | A checkpoint every AI-agent action must pass before it reaches the outside world |
| **Who** | Solo founders, freelancers and small agencies whose agents touch client email, invoices, files and payments; owners who are not technical |
| **The problem** | Agents act unsupervised: they can send the wrong client's private file, invent a number, quote below your floor, or delete an unpaid invoice. Nobody checks until someone complains |
| **What it does** | Logs every action and file read · labels data sensitivity from content · checks the recipient · traces every number in a draft to a file line · flags out-of-scope reads · applies your plain-English rules · answers allow / hold / block with a one-line reason and the evidence · offers gate-checked safe alternatives · rewinds mistakes · writes a daily briefing |
| **What it is not** | Not a logger-only tool, not an LLM judging other LLMs. Deterministic code decides; a model never sits in the decision path |
| **How** | One Node.js service, zero runtime dependencies, plus Postgres. Agents submit via a form or `POST /api/workspaces/{id}/actions`; execution connectors (simulated today) sit behind the gate |
| **Where** | [Live app](https://ayea3dar.qwenwork.page/) on QwenWork Pages; [demo on YouTube](https://youtu.be/XmI43zjAeo0); code here |
| **Proof** | 9/9 rogue scenarios caught · 27/27 checks · 27/27 benchmark files labelled from content · 0 false blocks and 0 holds on 21 clean actions · decision compute 0.1 ms p50 / 1.5 ms p95 ([results](#results)) |
| **Built for** | QwenWork x Hashmeta AI One-Person Company Hackathon 2026 · AvePoint track: AI Governance, Security & Decision-Making |
| **Honest scope** | Benchmark accuracy is measured on the organisers' kit, not claimed for arbitrary files; execution is simulated; the Studio agents are a labelled simulation |

**A concrete example.** Your finance agent drafts a reply about a late-filing surcharge: "15%, six days late, total 3,450." Your contract says a fixed SGD 600, and only if the delay was your fault. Your call notes say the client was four days late. Your invoice says 3,000. Tanod blocks the draft, shows each number next to the file line that contradicts it, and offers the corrected reply. One tap sends only the correct version. Nothing wrong was sent.

## Hackathon checklist

**Requirements**

| Requirement | Where |
|---|---|
| Public, open-source repository | This repo, [MIT](LICENSE) |
| Demo video, 3 minutes or less | [youtu.be/XmI43zjAeo0](https://youtu.be/XmI43zjAeo0): 2:58, 1080p30, chapters, captions |
| New work built during the event | Built 17-18 Nov 2026; only open-source tooling and the organisers' benchmark kit pre-existed |
| Meaningful use of QwenWork | App built and deployed on QwenWork Pages (dynamic runtime + provisioned database); three real QwenWork worker agents submitted drafts through the live gate; two QwenWork scheduled tasks (daily briefing, queue watch); QwenWork skills drove build, design review and publishing; the film was produced by a QwenWork-driven capture pipeline ([capability map](docs/capability-map.md)) |
| Fits the track | AvePoint AI Governance, Security & Decision-Making: guardrails, tamper-evident audit, human approval, reversible actions |
| A working product | [Live app](https://ayea3dar.qwenwork.page/) with persistent database; any business can onboard in under 15 minutes |

**Judging rubric (weights as shown on the event page)**

| Criterion | Evidence |
|---|---|
| **Innovation (30%)** | A gate that repairs, not just refuses: gate-checked safe options, rewind to checkpoints, claim-to-source evidence tracing, plain-English rule compiler ([how the gate decides](#how-the-gate-decides)) |
| **Feasibility & Viability (30%)** | Zero-dependency engine, measured sub-millisecond decisions, 0 false blocks on clean work, multi-tenant production design with cost model ([PRODUCTION.md](docs/PRODUCTION.md)) |
| **Use of QwenWork (20%)** | Pages runtime + database, live worker agents, scheduled tasks, skills, controlled publish, film pipeline ([capability map](docs/capability-map.md)) |
| **Demo & Presentation (20%)** | [2:58 narrated film](https://youtu.be/XmI43zjAeo0) with animated input→process→output and guardrail-logic deep-dives, live Studio rogue day, [presenter script](DEMO-WALKTHROUGH.md) |

*Note: the public Luma event page lists a variant including "Website built with Hashmeta AI (15%)". A paste-ready showcase-site brief is prepared ([docs/HASHMETA-SITE-BRIEF.md](docs/HASHMETA-SITE-BRIEF.md)) so either reading of the criteria is covered.*

## See it

<table>
<tr>
<td width="50%"><img src="docs/screenshots/today.png" alt="Today: decision tiles and the approval queue"><br><sub><b>Today.</b> Allowed / waiting / blocked at a glance, plus the queue of things that need you, with evidence attached.</sub></td>
<td width="50%"><img src="docs/screenshots/action-detail.png" alt="Action detail: claim versus source, and safe options"><br><sub><b>Any decision, opened.</b> Every number next to the file line that supports or contradicts it; blocked drafts carry safe options that passed the same gate.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/history.png" alt="History: hash-chained ledger with Verify"><br><sub><b>History.</b> A hash-chained ledger; one tap verifies it. A hand-edited record breaks the chain and Tanod says so.</sub></td>
<td width="50%"><img src="docs/screenshots/files.png" alt="Files: content-only sensitivity labels with reasons"><br><sub><b>Files.</b> Labels from content, with reasons, correctable by the owner.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/policy.png" alt="Policy: plain-English rules, toggles and floors"><br><sub><b>Policy.</b> Nineteen rules in plain words, toggles, price floors, and a compiler for sentences like "Never quote Clementi below 1,500".</sub></td>
<td width="50%"><img src="docs/screenshots/briefing.png" alt="Briefing: needs you, stopped, should know, routine"><br><sub><b>Briefing.</b> The owner's day in one read: needs you, stopped, should know, routine.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/studio.png" alt="Studio: simulated agents, real gate"><br><sub><b>Studio.</b> A labelled simulated day through the real gate; open Today in a second tab and watch decisions arrive.</sub></td>
<td width="50%"><img src="docs/screenshots/tests.png" alt="Tests: the measured suite"><br><sub><b>Tests.</b> Nine rogue scenarios plus a clean workday, replayed through the real gate and scored.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/setup.png" alt="Set up: onboarding for any business"><br><sub><b>Set up.</b> Any business: name it, upload files, confirm labels, list people, write rules, connect agents.</sub></td>
<td width="50%"><img src="docs/screenshots/outbox.png" alt="Outbox: the submission form and JSON API"><br><sub><b>Outbox.</b> The form a human can use, and the same action as JSON for agents.</sub></td>
</tr>
</table>

## How the gate decides

Think of a village gate with a watchman: anyone can walk around inside the village, but nothing leaves without passing the watchman, who knows the rules, checks what is being carried, and writes it in the logbook. *Tanod* is the Filipino word for that watchman.

```mermaid
flowchart LR
  AG[Worker agents] -->|every action| GW[Tanod gate]
  GW --> CL[Label the data]
  CL --> WC[Right recipient?]
  WC --> FC[Every number traced to a file?]
  FC --> SC[Reads within the task?]
  SC --> PO[Your rules]
  PO --> CO{Strictest answer wins}
  CO -->|Allow| EX[Do it + save a checkpoint]
  CO -->|Hold| Q[Waiting for you + safe options]
  CO -->|Block| BL[Stopped + explained + safe options]
  EX & Q & BL --> LG[(Hash-chained history)]
  LG --> BR[Daily briefing]
```

The rule table has three possible answers per rule: **allow**, **approve** (waiting for you), **never**. If you know git, the same ideas map neatly:

| Git | Tanod |
|---|---|
| Commit and log | Every agent action is an entry in the history |
| Pull request | "Waiting for you": prepared, not done |
| Protected branch | Rules even the owner cannot override in a hurry |
| Diff | "What will change": the exact email, deletion or payment, before it happens |
| Blame | Tap any number in a draft to see where it came from |
| Revert | Rewind to before a mistake |
| CI | The test suite re-runs whenever the rules change |

## Guardrails

Tanod is used where a mistake costs money, clients or compliance, by an owner who cannot audit every agent action. Six principles:

| | Principle | In practice | Evidence |
|---|---|---|---|
| 1 | **Agents draft; only the gate acts** | Agents hold no send/pay/delete rights; execution sits behind the gate (simulated today, connectors in production) | [PRODUCTION.md §2](docs/PRODUCTION.md) |
| 2 | **Fail closed** | If the policy store is unreachable, actions hold; never auto-allow | [PRODUCTION.md §5](docs/PRODUCTION.md) |
| 3 | **Code decides, not a model** | Deterministic checks and rule table; same input, same answer, always explainable | [engine](app/lib/engine.js), [results](#results) |
| 4 | **Every claim carries its evidence** | Each figure in a draft is shown with its file and line, or marked as having no source | [action detail](docs/screenshots/action-detail.png), S4 in [results](#results) |
| 5 | **NEVER cannot be approved away** | Below-floor offers, regulated data leaving, wrong-client sends and email-borne instructions have no override button | S2, S1, S6, S8 in [results](#results) |
| 6 | **Auditable and reversible** | Hash-chained ledger with one-tap verify; checkpoint before every action; rewind restores; safe options re-gated before offer | verify + tamper + rewind + merge checks in [results](#results) |

## For judges: try it in two minutes

| | |
|---|---|
| **Watch** | [The 2:58 demo](https://youtu.be/XmI43zjAeo0): rogue day, four catches, rewind, briefing, input→process→output, guardrail logic |
| **Open the app** | [ayea3dar.qwenwork.page](https://ayea3dar.qwenwork.page/): Today explains itself in three sentences |
| **Run a rogue day** | Studio → "Run the rogue day"; open Today in a second tab and watch 13 decisions arrive (5 allow, 3 hold, 5 block) |
| **Run the tests** | Tests page → "Run the suite", or `curl -X POST https://ayea3dar.qwenwork.page/api/workspaces/lumen-studio/tests/run` |
| **Submit an action yourself** | `curl -X POST https://ayea3dar.qwenwork.page/api/workspaces/brightledger/actions -H 'Content-Type: application/json' -d '{"agent":"judge-agent","task":"quote a price","action":"quote_price","to":"aisyah@clementicafe.example","amount":1100,"body":"We can match 1,100."}'` → blocked: below the owner's floor |
| **Read the decision logic** | [`app/lib/engine.js`](app/lib/engine.js) (the gate), [`app/lib/policy.js`](app/lib/policy.js) (rules + compiler), [`app/lib/facts.js`](app/lib/facts.js) (claim-to-source) |
| **Run it locally** | `cd app && node server.js` → http://localhost:8081 (in-memory, seeds both demo workspaces; no keys needed) |
| **Benchmark it** | `node scripts/bench-decide.mjs` → decision latency percentiles |

## Results

All numbers from the built-in runner and local benchmarks, 18 Nov 2026. Re-run any row yourself.

| Check | Result | How |
|---|---|---|
| Rogue scenarios S1-S9 (decision + rules + evidence) | 9/9 scenarios, 27/27 checks (kit S1-S5: 15/15) | Tests page, or `curl -X POST .../api/workspaces/lumen-studio/tests/run` |
| Benchmark files labelled from content alone (headers ignored) | 27/27 | same suite |
| Clean workday: 21 ordinary actions | 0 false blocks, 0 holds | same suite |
| History chain verify on a clean chain | pass | History → Verify chain |
| Hand-edited ledger entry | detected | suite tamper check |
| Released delete, then rewind | file restored; irreversible effects listed with correction drafts | suite rewind check |
| Safe option on a blocked draft | re-gated, then merged and executed | suite merge check; also live in the film at 0:46 |
| Real QwenWork agents through the live API | 9 drafts; client-list upload and wrong-client proposal blocked from actual agent output | [capability map](docs/capability-map.md) |
| Decision compute (96 dry-run decisions, laptop CPU) | p50 0.1 ms, p95 1.5 ms, max 25.4 ms cold | `node scripts/bench-decide.mjs` |
| Real Quest-style headset / real email execution | **not tested / simulated** | execution is a test outbox and soft deletes, labelled in the UI |

## The name and the logo

<img src="docs/brand/tanod-icon.svg" alt="Tanod mark: a gate arch with a check passing through it, on a lime tile" width="72" align="left">

**Tanod** is the Filipino word for a village watchman: the person at the gate who knows the rules, checks what leaves, and writes it in the logbook. **The logo is that gate:** an arch with a check passing through it, on a lime tile. It reads at 16 px and works in one colour.

**Colours:** lime `#CBF083` allowed, peach `#FFBFB3` waiting, pink `#F7B9D2` blocked, blue `#BBDDF5` totals, on a pale cool canvas `#EDF2F6` with ink `#14181D`. **Type:** Outfit (SIL OFL), self-hosted. Assets and exports: [`docs/brand/`](docs/brand/).

## From hackathon to production

| Step | What |
|---|---|
| Auth and isolation | Per-workspace API keys, owner SSO, Postgres row-level security |
| Real execution | Email/storage/payment connectors behind the gate, idempotency keys + outbox, exactly-once |
| Files and checkpoints | Object storage with versioned snapshots |
| Audit anchoring | Daily ledger Merkle roots to immutable storage; scheduled chain verify freezes releases on mismatch |
| Notifications | Holds and briefings via email/Slack/WhatsApp connectors |
| Optional LLM | Briefing prose only, numbers strictly from the ledger, template fallback |

Measured feasibility: sub-millisecond median decision compute; a solo business's tens of actions per day leave orders of magnitude of headroom on one small database; estimated $36-110/month for a small tenant pool (labelled estimate). Full architecture, sequence diagram, security and compliance table, reliability targets, cost model, migration path and risk register: [docs/PRODUCTION.md](docs/PRODUCTION.md).

## How Tanod differs

- **Vs plain audit logging:** logging records what happened; Tanod decides before it happens, and can undo it afterwards.
- **Vs an LLM judging LLMs:** the decision path is deterministic code with evidence, so it is reproducible, explainable, fast and outage-proof; a model is optional and confined to briefing prose.
- **Vs platform-level guardrails:** Tanod is business-aware: your files, your clients, your floors, your rules in plain English, and a briefing a non-technical owner can read in one glance.

## Documentation

| Document | What's in it |
|---|---|
| [DEMO-WALKTHROUGH.md](DEMO-WALKTHROUGH.md) | Presenter script: one-minute pitch, seven live steps, simulated-vs-real, five judge questions |
| [docs/PRODUCTION.md](docs/PRODUCTION.md) | Production infrastructure, security, reliability, measured latency, cost model, migration, risks |
| [docs/capability-map.md](docs/capability-map.md) | Every QwenWork capability observed and relied on, with results |
| [docs/gates.md](docs/gates.md) | G1 / G2 / G3 gates with evidence (git tags) |
| [docs/constitution.md](docs/constitution.md) | Project rules, ratified before building |
| [docs/YOUTUBE.md](docs/YOUTUBE.md) | YouTube upload pack: title, description, chapters, tags, settings, thumbnail |
| [docs/brand/](docs/brand/) | Logo SVGs/PNGs, social card, A1 poster PDF |
| [docs/screenshots/](docs/screenshots/) | Every page, captured from the live build |
| [specs/](specs/) | One specification per feature; RUN_SHEET.md gives the build order |
| [app/README.md](app/README.md) | Run locally, layout, restoring the benchmark kit data |

## Repository map

| Path | What it is |
|---|---|
| [`app/`](app/) | The live application: Node.js, zero runtime dependencies |
| [`assets/`](assets/) | Demo film, captions, Kokoro narration stems + timing |
| [`scripts/`](scripts/) | Decision-latency benchmark |
| [`docs/`](docs/) | Production plan, capability map, gates, brand, screens, YouTube pack |
| [`specs/`](specs/) | Feature specifications and run sheet |
| [`rules/`](rules/) | Our scenarios S6-S9 |
| [`data/inbox/`](data/inbox/) | Our additional demo file for S8 |

## Credits

Made by [Aljabri Alam](https://github.com/aljabrialam) for the QwenWork x Hashmeta AI One-Person Company Hackathon 2026 (AvePoint track), built 17-18 Nov 2026.

Code: [MIT](LICENSE). Typeface: Outfit, SIL Open Font License 1.1 (included). Narration: Kokoro-82M (open weights), generated locally. Music: QwenWork music generation, verified instrumental. Footage: real app captured through the browser; explainer boards animated from recorded data. The organisers' starter kit is used as a benchmark only and is not redistributed.