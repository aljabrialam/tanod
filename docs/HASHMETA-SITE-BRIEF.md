# Tanod — Hashmeta AI CMS showcase-site brief

**Status: recommended — build it.** The judging sources conflict: the app.hashmeta.ai event-page screenshot shows 30/30/20/20 with no Hashmeta-site weight, but the public Luma event page lists "Website built with Hashmeta AI (15%)" event-wide (not per track). Until the organisers confirm, building this site covers the 15% risk and doubles as the pitch landing page. Everything below is paste-ready for Hashmeta AI CMS ("describe your business and AI builds the pages"). Publishing needs your Hashmeta login.

---

## 1. One-prompt brief (paste into AI CMS)

> Build a one-page product showcase site for **Tanod**, an AI oversight gate for one-person businesses. Tagline: "Your agents draft. Tanod decides what leaves." Audience: solo business owners who use AI agents, and hackathon judges. Tone: calm, plain language, zero jargon, no hype. Structure: hero with tagline and two buttons (Try the live demo / Watch the 3-minute demo), a "The problem" section, a "How Tanod works" 4-step section, a "Measured, not claimed" results section, a video embed section, a poster/image section, and a footer with the GitHub repo link. Use a dark, quiet palette with green/amber/red decision badges. English. SEO/GEO target queries: "AI agent oversight for small business", "guardrails for AI agents", "human approval gate for AI actions", "AI governance one-person company". Include the factual content below verbatim where possible; do not invent numbers.

## 2. Hero

- **Title:** Tanod
- **Tagline:** Your agents draft. Tanod decides what leaves.
- **Subline:** The oversight gate between a solo owner's AI agents and the outside world. Every action is logged, checked, and allowed, held for you, or blocked — in plain language.
- **Primary button:** Try the live demo → https://ayea3dar.qwenwork.page/#/studio
- **Secondary button:** Open the app → https://ayea3dar.qwenwork.page/

## 3. The problem (paste as-is)

One person, five AI agents, no compliance team. Agents draft emails, quotes, uploads and deletions all day. Most are fine. Some leak a client list, invent a number, quote below your floor, or send the wrong client's proposal. You can't read everything — and you shouldn't have to. Tanod stands at the gate: agents draft, Tanod decides what leaves, and you only see what needs you.

## 4. How Tanod works (4 steps)

1. **Every action passes the gate.** Agents submit each email, quote, upload or deletion to Tanod before it happens — by form or by API.
2. **Deterministic checks decide.** Content-only sensitivity labels, your policy rules, price floors, wrong-client detection, hidden-instruction detection, and a fact check that traces every number in a draft to the source line it came from.
3. **Allow / Hold / Block, in one read.** Each decision comes with a one-line plain-language reason and the evidence. Held items wait in your approval queue; blocked items offer gate-checked safe alternatives you can run in one tap.
4. **Nothing is lost.** A tamper-evident, hash-chained history records everything; checkpoints let you rewind; and a daily briefing tells you what needs you, what was stopped, and what you should know.

## 5. Measured, not claimed (use these exact numbers)

- 9/9 rogue-agent scenarios caught (S1–S9, including the starter kit's five)
- 27/27 scenario checks passed (decision + rules + evidence); kit subset 15/15
- 27/27 business files labelled correctly from content alone (answer headers ignored)
- 0 false blocks and 0 holds on 21 ordinary, clean actions
- History chain verifies; a hand-edited entry is detected
- Live QwenWork worker agents (marketing, sales, finance) submitted real drafts through the same gate; the client-list upload and the wrong-client proposal were blocked from actual agent output
- Honest limits: the decision engine is deterministic (no LLM inside the gate); execution is simulated (test outbox, soft deletes restorable for 30 days)

## 6. Video section

- Embed slot: **3-minute demo video** (YouTube unlisted, title "Tanod demo", #QwenWork #Hashmeta #AvePoint) — paste the URL once exported
- Embed slot: **60-second daily briefing video** — paste the URL once exported
- Caption: "Filmed on the live app. The Studio run you see is the same gate the API uses."

## 7. Poster / image section

- 1080 × 1350 PNG (social / Hashmeta hero) and 1920 × 1080 PNG — export from the app's Poster page (`/#/poster`) once finalised
- Alt text: "Tanod poster: Your agents draft. Tanod decides what leaves. 9/9 scenarios, 27/27 checks, 0 false blocks."

## 8. Footer

- GitHub: https://github.com/aljabrialam/tanod
- Live app: https://ayea3dar.qwenwork.page/
- API for agents: `POST https://ayea3dar.qwenwork.page/api/workspaces/lumen-studio/actions`
- Built with QwenWork · QwenWork x Hashmeta AI One-Person Company Hackathon · AvePoint track (AI Governance, Security & Decision-Making)

## 9. Publishing steps (needs your Hashmeta login)

1. Sign in at https://app.hashmeta.ai/ → AI CMS → new site
2. Paste the brief in section 1; let it generate the page
3. Replace/verify each section with the copy above; add the video URLs and poster PNGs when ready
4. Check the SEO/GEO settings include the target queries; publish
5. Submit the site URL in the event's submission section (only if it asks for one)