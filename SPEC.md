# Feature → Enablement Video Pipeline — Design Spec

**Date:** 2026-07-07
**Status:** Approved design (pre-implementation-plan)
**Author:** rakshith.hegde@uipath.com + Claude
**Related:** `CLAUDE.md` (project brief)

---

## 1. Goal

Generate high-production **enablement content** — a premium video (champion artifact) plus
an enablement one-pager (secondary) — good enough that (a) sales *understands* the feature
and (b) it can be *shown to customers*. The trigger is typically a merge, but the input can
come from several sources (see §1.1).

**Duration is content-driven, not fixed.** "Tight and premium" is a quality principle, not
a number. The video takes the time the story needs — explaining a use case or positioning
well can justifiably run longer, and a hard ~45s cap would hurt that. VO length drives
scene timing; any target range is guidance, not a constraint.

**Scope for this build:** the **internal-enablement cut** only. The customer cut is an
interface seam, not implemented.

**Feature-agnostic:** the pipeline is not built around any one UiPath feature. It is
exercised against a checked-in **fixture context** so it can run without external auth or a
chosen feature.

## 1.1 Input sources (ingest adapters)

The pipeline accepts context from multiple interchangeable sources, each normalizing into a
common `SourceContext` that the content director consumes:

- **Manual prompt / context** — the user pastes a free-text prompt or feature context.
  Simplest path, no external auth. **This is the first milestone** — the shortest route to
  an end-to-end video.
- **PR merge** — pr-to-video's `gh` reader (title, body, diff, commits, contributors,
  linked issue). The richest evidence source (claim-check against the diff).
- **Jira ticket** — fetched via Atlassian; description, acceptance criteria, linked issues.

Because everything funnels through `SourceContext`, adding a source later means writing one
adapter, not touching the rest of the pipeline.

## 2. Core bet (validated by spike)

Build **brand + editorial on top of HyperFrames**, not author every composition from
scratch. The 2026-07-07 spike confirmed:

- HyperFrames renders end-to-end on this machine (10s 1080p H.264 MP4 in ~22s; Node 24,
  FFmpeg 8.1.2, system Chrome, Docker all green).
- Default template quality is genuinely premium and is plain HTML/CSS/GSAP → fully
  reskinnable via our token layer.
- `/pr-to-video` already does PR → structured plan (`STORYBOARD.md`/`SCRIPT.md`/
  `audio_meta.json`) → HTML → MP4. It is **purely technical/editorial — no
  sales/positioning/enablement layer**. That gap is our core IP.
- It is overridable: a `tokens.json` + `build-frame.mjs` remix hook for palette/typography
  (our token layer plugs in here), and `STORYBOARD.md`/`SCRIPT.md` as the narrative
  override lever (what our content director generates).

**Chosen approach: A — Wrap & extend.** Reuse pr-to-video's ingest+render spine; add the
enablement narrative (content director), the brand skin (token layer), and auto-zoom
(camera director); stub the edges.

## 3. Architecture

```
  SOURCE                    ┌─────────── OUR IP ───────────┐
(prompt / PR / Jira) ─▶ ingest ─▶ CONTENT DIRECTOR ─▶ video-plan.json ─▶ enablement STORYBOARD/SCRIPT
  → SourceContext  (adapter)  (sales+narrative)    (§7 contract)          │
                          TOKEN LAYER (done) ─ tokens.json ─┤ (reskins the render)
                                                            ▼
   Playwright ─▶ hyperframes capture ─▶ clip + ROI track ─▶ CAMERA DIRECTOR (auto-zoom)
                                                            ▼
   asset gen (callouts/cards/diagram) + tts VO + captions ─▶ compositions ─▶ RENDER ─▶ video.mp4
                                                            ▼
              CONTENT QA (claim-check + brand + lint/validate) ─▶ DRAFT (video + one-pager + prepared YT meta)
                                                            ▼
                          HUMAN APPROVAL ─▶ (opt-in) PUBLISH  ← never automatic
```

The pipeline's **terminal state is a reviewable draft**. Publishing is a separate,
explicitly-invoked, human-gated step (see §6).

## 4. Components

Legend: 🔨 build real · ♻️ reuse HyperFrames · 🧩 stub with real interface · ✅ done

| # | Component | Status | Responsibility |
|---|-----------|--------|----------------|
| 1 | Ingest / source adapters | 🔨 + ♻️ | Normalize any source → `SourceContext`. Manual-prompt adapter (build, first milestone); PR adapter (reuse pr-to-video's `gh` reader); Jira adapter (Atlassian). |
| 2 | **Content Director** | 🔨 CORE IP | PR context → `video-plan.json` (§7 of brief) with the 5-section enablement arc incl. **positioning/sales layer**; then emits enablement `STORYBOARD.md`/`SCRIPT.md`. Hallucination guard. Claude skill. |
| 3 | Token Layer | ✅ | `brand/uipath-tokens.{json,css}` + `brand/logos/`. Resolver maps scene needs → assets and feeds `tokens.json` into the remix hook. |
| 4 | **Camera Director** | 🔨 targeting | Playwright element bboxes → timed ROI track `{t, focus:bbox(x,y,w,h), action}`. Automate *targeting*; hand-tune *motion* (easing/hold). |
| 5 | Capture | 🔨 browser path | Playwright driver (from `demo_steps`, or reuse an E2E test) + `hyperframes capture` → demo clip + ROI track. Interface allows a recorded-clip fallback source. |
| 6 | Asset generators | 🔨 callout + 1 diagram | Callout/annotation layer (driven by ROI track); title/section cards; ONE templated **code-defined** diagram (not model-drawn); kinetic captions. Image-model gen = 🧩. |
| 7 | Render / media | ♻️ | HyperFrames `render`; **audio**: VO via `tts` (Kokoro local, 12 voices) OR HeyGen cloud voices OR any external WAV — all attach as a timed `<audio>` track (video `muted` + separate audio, VO drives timing, FFmpeg mux); `transcribe` (Whisper captions); music (ducked under VO). Verified end-to-end: generate speech → mux → narrated MP4 (h264+aac). |
| 8 | Content QA gate | 🔨 | Claim-check narration against the diff; brand compliance; contrast/margins. Wraps HyperFrames `lint` + `validate`. |
| 9 | One-pager | 🔨 | `video-plan.json` → enablement one-pager (`.md`/`.html`). Secondary artifact; distinct from docs — carries positioning/objections, not how-to steps. |
| 10 | Publish | 🧩 **optional** | YouTube (title/desc/chapters from scene boundaries, unlisted, "Enablement" playlist) + Slack ping. **Opt-in only, never automatic.** |
| 11 | Merge trigger | 🧩 | Manual "run on this PR" for the demo; webhook interface only. |
| 12 | Approval gate | 🧩 | Draft-on-merge → human review before any customer-facing publish. |

### Interfaces (contracts between stages)

- `ingest(source) → SourceContext` (source = prompt | PR | Jira; one adapter per kind)
- `contentDirector(SourceContext) → VideoPlan` (validates against `plan.schema.json`)
- `tokenResolver(VideoPlan) → tokens.json + asset map`
- `capture(VideoPlan.demo_steps) → { clipPath, roiTrack[] }` (optional — skipped when the source has no demoable UI, e.g. a pure prompt)
- `cameraDirector(roiTrack) → zoomTrack` (with hand-tuned easing/hold config)
- `assetGen(VideoPlan, zoomTrack) → composition HTML fragments`
- `render(video/ project) → renders/video.mp4` (HyperFrames)
- `contentQA(VideoPlan, diff, renderedProject) → QAReport` (blocks publish on failure)
- `onePager(VideoPlan) → one-pager.md`
- `publish(draft) → { youtubeUrl, slackMsg }` — **only when explicitly invoked**

Each stage is independently testable and communicates through these typed contracts.

## 5. Data flow & the VideoPlan contract

The `VideoPlan` (brief §7) is the spine artifact every downstream stage reads:

```
feature_name, value_prop, persona, when_to_use, talking_points[]
narration_script (per scene)
scenes[]: { id, type, duration, on_screen_text, narration,
            footage_requirement?: { steps[] },
            asset_requirements[]: { need, spec } }
youtube_metadata: { title, description, tags, chapters[] }
```

**Hard constraint:** the content director must not invent claims the **source context**
doesn't support — the diff (PR), the ticket (Jira), or the text the user provided (manual
prompt). A hallucinated benefit shown to a customer is the failure mode that kills trust.
The content QA gate re-checks narration against the source's evidence independently. For a
thin manual prompt, that means the video stays faithful to what the user actually said.

Scene arc (content director output): hook (customer problem) → capability + one-line value
→ demo (real footage + auto-zoom) → **positioning (sales layer)** → CTA. The positioning
section is what makes it enablement, not a product tour; it stays in the internal cut. The
demo section is conditional: present when the source has demoable UI (PR/Jira with a
browser feature), gracefully replaced by diagram/motion-graphic scenes for a pure prompt.
Section durations flex to the content — no fixed per-section budget.

## 6. Publish is optional (approved change)

- Running the pipeline **never publishes**. It ends at a draft: `renders/video.mp4` +
  `one-pager.md` + **prepared** (not uploaded) YouTube metadata.
- `publish` is a separate command a human runs *after* review.
- Rationale: merge = capture trigger, not publish trigger. One broken auto-video shown to a
  customer kills trust in the whole system.

## 7. Repo structure

```
Hackweek2k26/
  brand/                  # ✅ token layer: tokens.json/.css, logos/
  content-director/       # CORE IP: SKILL.md + plan.schema.json
  camera-director/        # ROI zoom-track builder + easing config
  capture/                # Playwright driver → clip + ROI track
  assets/                 # callout, section-card, one templated diagram generators
  qa/                     # content gate: claim-check + brand compliance
  one-pager/              # plan → one-pager.md/html
  publish/                # youtube + slack (stubs, opt-in)
  pipeline/               # orchestrator wiring the stages
  video/                  # HyperFrames render target: index.html, compositions/, audio/, renders/
  docs/                   # specs & docs
```

Our modules generate into `video/`; the HyperFrames render spine consumes it.

**Runtime:** Node/TS for orchestrator + generators (matches HyperFrames Node 22+ / bun).
Content director as a Claude skill (markdown). Camera director in Node (Playwright is
Node-native). Node pinned to 22+ via nvm (`nvm use stable` → v24 present).

## 8. Testing strategy

TDD per unit; one end-to-end integration test.

- **Unit:** plan schema validation; content-QA claim-checker (narration vs diff); camera
  director ROI/zoom math; token resolver; one-pager generation.
- **Integration:** run the pipeline on a checked-in **fixture context** (a manual-prompt
  `SourceContext` JSON) → assert a valid `VideoPlan` and a produced `renders/video.mp4`.
  Feature-agnostic; no external auth needed. A PR-fixture variant covers the diff path.
- **Visual QA:** HyperFrames `snapshot`/`inspect` on key frames; manual review of the hero
  frame against the brand tokens.

## 9. Error handling & fallbacks

- Capture failure (browser path) → fall back to recorded-clip source via the same
  `capture()` interface.
- Missing/failed tokens → fall back to HyperFrames default preset (still renders).
- Content QA failure (unsupported claim / brand violation) → **blocks publish**, surfaces
  the specific claim; draft still viewable for human editing.
- HyperFrames framework rough edges (weeks-old) → prefer config over fighting bugs; lint
  warnings that still render are acceptable (documented in brief §10).

## 10. Environment (validated 2026-07-07)

- Node 24.14.1 via nvm (satisfies 22+); FFmpeg 8.1.2 + ffprobe; system Chrome; Docker
  running; bun 1.3.14. `brew` unblocked (`brew trust mongodb/brew`).
- Optional, not yet installed (add if needed): whisper-cpp (transcription), MusicGen
  (local music). Core render path does not require them.
- **Audio subsystem verified:** attach path proven end-to-end (speech → FFmpeg mux →
  narrated MP4, h264+aac). Local **Kokoro TTS is currently blocked** on this machine by an
  `espeakng_loader` bug (prebuilt dylib hardcodes a CI-runner data path, ignoring env). VO
  is therefore sourced from HeyGen cloud voices or any external TTS (WAV) until the Kokoro
  data-path issue is resolved — not a blocker for producing a narrated video. espeak-ng
  1.52 installed via brew; py3.12 venv present for local ML tooling.

## 11. Out of scope (YAGNI for this build)

- Customer-facing polished cut (interface seam only).
- Real merge webhook / CI trigger (manual run for demo).
- Image-model asset generation (interface only).
- Full YouTube upload automation + Slack (stubs; opt-in).
- Desktop/Studio-app capture (browser product chosen).

## 12. Open items (resolve during planning)

- Confirm the exact `tokens.json` remix mechanism in pr-to-video's `build-frame.mjs`
  (verify our token shape maps cleanly to its expected schema).
- Obtain white-out and black logo variants (ideally SVG) — current asset is orange PNG,
  best on light backgrounds; enablement video likely uses a Deep Blue backdrop needing the
  white-out logo.
- Confirm whether we have an Urbane Rounded webfont license (else Poppins fallback stands).
- Pick the fixture PR content (synthetic, feature-agnostic) for the integration test.
- Choose the VO source for the build: HeyGen cloud voices (needs auth) vs. external TTS vs.
  fixing local Kokoro's `espeakng_loader` data-path bug.
