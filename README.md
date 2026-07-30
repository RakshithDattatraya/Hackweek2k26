# Amplify

**From merged to market — automatically.** When a feature ships, Amplify turns it into sales-ready enablement — a grounded one-pager and video — and stores it straight into UiPath Data Service.

> This repo is both the **deployable coded agent** and the **video/one-pager production pipeline** behind it.

---

## The problem

Features ship, and the field doesn't know. Forward-deployed engineers, sales, and SEs either don't know a capability exists or can't articulate and demo its value — so the knowledge trickles out over weeks via release notes, Slack threads, and digging through PRs.

**The insight:** the moment of merge is when the engineer has *maximum context* about what was built and why. Amplify captures it right there — before it evaporates — and turns it into enablement anyone can use the same day.

## What it produces

- **A one-pager** — value, who it's for, when to use it, and objection-handling (a sales leave-behind).
- **A video** — a short, on-brand enablement film: the customer problem, the capability, a real demo with auto-zoom, positioning, and a CTA.
- **A release digest** — for release URLs: a grouped one-pager + a Slack/Confluence-ready digest.

Everything is **grounded in the actual pull request** (no invented claims), on-brand via the UiPath design-token layer, and stored as an `EnablementAsset` row + files in a Storage Bucket for a review App to surface.

## How it works

A UiPath **coded agent** (LangGraph) runs as a graph:

```
Jira label "Amplify"  →  ingest  →  author  →  render  →  store
```

1. **Trigger** — a Jira issue is labelled `Amplify`; an Integration Service trigger starts the agent and hands it the linked PR/release URLs.
2. **Ingest & route** — fetch the real PR (title, body, diff, commits) from GitHub (PAT from an Orchestrator asset); classify **feature** vs **release**.
3. **Content director** *(core IP)* — Claude Opus via the UiPath AI Trust Layer turns the diff into a grounded plan: value prop, persona, when-to-use, talking points, objections, scenes.
4. **Camera director** — on real footage, the camera holds a full view and pushes in only on interactions, then eases out.
5. **Produce** — dynamic on-brand HTML/GSAP scenes, ElevenLabs voice, music, captions.
6. **QA + claim-check** — structural lint *and* a claim-check that verifies every spoken line against the diff; unsupported claims are flagged.
7. **Render** — headless Chrome seeks a paused timeline → FFmpeg → MP4; one-pagers/digests are pure HTML.
8. **Store** — upload to the `amplify-assets` bucket, write an `EnablementAsset` row with `reviewStatus = false` (a merge captures, it doesn't publish). A human approves before anything customer-facing ships.

📖 **Full internal walk-through:** [`docs/AMPLIFY-INTERNALS.md`](docs/AMPLIFY-INTERNALS.md) (also `.pdf`).

## Repo layout

| Path | What's in it |
|------|--------------|
| `amplify-agent/` | The deployable UiPath coded agent (LangGraph). `main.py`, `DEPLOY.md`, entity setup. |
| `amplify-render/` | Render step packaged for a toolchain worker. |
| `src/pipeline/` | The video/one-pager pipeline — `build-plan.ts` (animated), `build-from-branch.ts` (footage-wrapped), `build-release.ts` (release). |
| `src/content-director/` | Plan schemas (VideoPlan v3 / ReleasePlan). |
| `src/scenes/`, `src/compose/` | Scene component registry + composition. |
| `src/onepager/`, `src/release/` | One-pager + release-digest renderers. |
| `src/audio/`, `src/qa/`, `src/footage/` | TTS/music/captions, QA + claim-check, camera/zoom. |
| `brand/` | UiPath design tokens, logo, audio library. |
| `docs/` | Architecture doc + specs/plans. |
| `pr18704*.v3.json`, `pr715.v3.json` | Example authored plans (StudioWeb Base64, FinS loan-config). |

## Run it

### The coded agent (UiPath)
```bash
cd amplify-agent
uv sync                       # or: pip install -e .
uipath auth --staging         # sign in to your org/tenant
uipath pack && uipath publish # deploy the agent package
```
Config is via env (`AMPLIFY_FOLDER_PATH`, `AMPLIFY_ENTITY`, `AMPLIFY_GITHUB_ASSET`, `AMPLIFY_LLM_MODEL`, …). See [`amplify-agent/DEPLOY.md`](amplify-agent/DEPLOY.md).

> **`AMPLIFY_DRY_RUN` defaults ON** — the agent runs the full graph and reports success but writes nothing to the bucket/entity (safe for live demos). Set `AMPLIFY_DRY_RUN=false` to enable real persistence.

### The video pipeline (local)
Needs **Node 22+, bun, headless Chrome, FFmpeg**. Optional: `ELEVENLABS_API_KEY` (or `.elevenlabs.key`) for voice.
```bash
export HYPERFRAMES_NODE_BIN="$(dirname "$(nvm which stable)")"   # Node 22+
bun run src/pipeline/build-plan.ts        pr18704-short.v3.json  # animated video + one-pager
bun run src/pipeline/build-from-branch.ts pr715.v3.json          # footage-wrapped video
bun run src/pipeline/build-release.ts     <release-plan.json>    # release one-pager + digest
```
Output lands in `out/`; QA + claim-check results in `out/**/qa-report.json`.

## Status (honest)

- ✅ **Live end-to-end for releases** — a labelled ticket → one-pager + digest, stored automatically.
- ✅ **Feature one-pagers + the full video pipeline** — grounded, claim-checked, on-brand, with ElevenLabs voice.
- 🛠️ **Automatic feature *video* from the agent** needs a **render worker** with the browser toolchain (Chrome/FFmpeg) — a serverless sandbox can't host a browser. Today the premium demos are produced by the pipeline with a creative director in the loop.

## Roadmap

Close the loop (render worker + review App + auto-publish to YouTube/Slack/hub) → two cuts (internal + customer) and higher autonomy → scale, an enablement knowledge base, and a feedback loop. Full roadmap in [`docs/`](docs/).

## Built on

UiPath Agents SDK (`uipath`, `uipath-langchain`) · LangGraph · Claude Opus (AI Trust Layer / Bedrock) · Data Service · Storage Buckets · Integration Service (Jira, GitHub) · HyperFrames (headless Chrome + FFmpeg) · GSAP · ElevenLabs · Whisper · bun / TypeScript.

---

*Amplify — merge is the capture trigger, not the publish trigger: the moment of maximum context, caught before it evaporates.*
