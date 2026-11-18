# Tanod demo: YouTube upload kit

Everything below is paste-ready. Files to upload are listed at the top; every field after that maps to a YouTube Studio field.

## Files

| Purpose | File | Notes |
|---|---|---|
| Video | `outputs/tanod-demo.mp4` | 2:58, 1920x1080, 30 fps, H.264 + AAC. YouTube-ready as is |
| Captions | `outputs/tanod-demo.srt` | Upload as English subtitles (Studio → Subtitles → Add language → English → Upload file). Captions are also burned into the video |
| Thumbnail | `outputs/youtube-thumbnail.png` | 1280x720, 57 KB, under the 2 MB limit |

## Details (paste into YouTube Studio)

**Title** (60 chars):
Tanod demo: your agents draft, Tanod decides what leaves

**Description**:
Tanod is the oversight gate between a solo business owner's AI agents and the outside world. The agents keep drafting, but nothing they draft can leave until Tanod checks it against the owner's files and rules and gives one of three answers: allowed, waiting for you, or blocked, each with a one-line reason in plain words.

This demo shows one day at a solo business twice: ordinary work flowing through untouched, and a rogue day where agents misbehave nine ways and Tanod catches each one live. It then opens the hood: one real recorded action shown end to end (input, checks, output), and the guardrail logic explained with animations.

Measured, not claimed: 9/9 rogue scenarios caught, 27/27 checks passed, 27/27 benchmark files labelled correctly from content alone, 0 false blocks on 21 clean actions. Decision compute: 0.1 ms median, 1.5 ms at p95.

Honesty notes: the Studio worker agents are a labelled simulation; every decision they trigger is made by the real gate and written to the real history. Execution is simulated (test outbox, soft deletes restorable 30 days). The rewind scene shows a clean history verify; the tamper catch is proven in the test suite. The briefing scene shows the live briefing page.

Try it live: https://ayea3dar.qwenwork.page/
Run a rogue day yourself: https://ayea3dar.qwenwork.page/#/studio
Code and docs: https://github.com/aljabrialam/tanod
Production architecture and feasibility: https://github.com/aljabrialam/tanod/blob/main/docs/PRODUCTION.md

Chapters:
0:00 What Tanod is
0:05 The problem: a solo owner, agents nobody checks
0:19 How the gate works
0:36 Set-up for any business (sped up 3x)
0:46 Catch 1: made-up numbers, corrected in one tap
1:04 Catch 2: an offer below the price floor
1:12 Catch 3: the wrong client's proposal
1:19 Catch 4: hidden instructions in an email
1:30 Clean work goes straight through
1:34 Rewind a mistake, verify the history
1:45 The owner's daily briefing
1:55 Under the hood: input, process, output
2:25 The guardrail logic
2:49 Measured results and the live app

Built on QwenWork for the QwenWork x Hashmeta AI One-Person Company Hackathon, AvePoint track (AI Governance, Security & Decision-Making). Narration: Kokoro TTS. Music: QwenWork music generation. Footage: real app captured through the browser.

#QwenWork #Hashmeta #AvePoint

**Tags** (comma-separated, paste into the Tags field):
tanod, ai agents, ai governance, agent guardrails, ai oversight, human in the loop, agent safety, ai security, approval workflow, one person company, solopreneur, hackathon, qwenwork, hashmeta, avepoint, llm agents, prompt injection, ai compliance, tamper evident log

**Hashtags** (already at the end of the description; YouTube shows the first three above the title):
#QwenWork #Hashmeta #AvePoint

**Visibility**: Unlisted (per the submission plan; share the link in the event submission form). Switch to Public only if you want it discoverable.

**Audience**: No, it is not made for kids.

**Category**: Science & Technology.

**Language**: English (video language and subtitle language).

**Subtitles**: upload `tanod-demo.srt` as English. Burned-in captions are already in the picture; the sidecar lets viewers toggle or translate.

**Thumbnail**: upload `youtube-thumbnail.png`.

**License**: Standard YouTube License. **Allow embedding**: yes (so the event page and README can embed it).

**Recording date**: 18 Nov 2026. **Location**: Singapore (optional fields).

**Playlist** (optional): create "Tanod · QwenWork x Hashmeta Hackathon" and add this video; later add the 60-second briefing video.

**End screen / cards** (optional): card at 2:49 linking to the live app URL in the description; end screen with a subscribe element only if you plan a channel series.

## After upload

1. DONE: video uploaded by the owner. URL: https://youtu.be/XmI43zjAeo0 (verified resolving with the demo title).
2. Paste that URL into the official submission form: https://survey.alibabacloud.com/uone/sg/survey/nXEUDcuj-?utm_source=luma (the "Submit Demo Here" link on the Luma event page; verified resolving).
3. DONE: README "Watch the demo" section links the YouTube URL (thumbnail links to it); the mp4 stays as the offline fallback.
4. Keep the mp4 in the repo as the offline fallback for the live pitch.