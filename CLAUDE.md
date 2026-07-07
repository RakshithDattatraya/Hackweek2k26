# Feature → Enablement Video Pipeline — Project Brief

> Hackweek project. Working context / handoff doc. Read this first.
> When a developer merges a feature, generate high-production enablement content
> (video + one-pager) good enough that (a) sales *understands* the feature and
> (b) it can be *shown to customers*, and shippable to YouTube for enablement.

---

## 1. The problem & the core insight

The engineering→enablement gap: features ship, and sales either doesn't know they
exist or can't articulate/demo the value. Expensive and universal.

**Core insight:** the moment of merge is when the engineer has *maximum context*
about what was built and why. Capture that before it evaporates. Most enablement
fails because someone reconstructs this context weeks later.

## 2. Scope philosophy (read before building anything)

- **Merge = CAPTURE trigger, not PUBLISH trigger.** A merge is often a slice of a
  feature, behind a flag, or a refactor. Auto-publishing polished customer videos
  on every merge produces noise, wrong/duplicate content, and one broken
  auto-video shown to a customer kills trust in the whole system. So: on merge,
  generate a *draft* + route to a human before anything customer-facing ships.
- **Two audiences, two cuts, ONE plan.** "Sales understands" (internal, rough bar,
  keeps positioning/objection-handling) vs "show customers" (polished, legal/brand
  bar, strips internal segments). Emit both cuts from one video plan.
  For hackweek, build the **internal-enablement cut** — it's the stated primary
  goal and has the lower polish/legal bar.
- **The hackweek judge cares about the OUTPUT, not the architecture.** A hardcoded
  happy-path that produces a genuinely premium 45s video beats a fully-automated
  pipeline with mediocre output. Protect video-quality time; treat automation as
  the means. Commit early to "the video must look genuinely good" as north star.

## 3. The key reframe: TWO directors, not one

Most auto-generated demos feel "off" because content and camera are conflated.
Split them:

- **Content director** — what the feature *means*, the story, what sales needs to
  hear. Reasons over PR context. THIS IS THE CORE IP.
- **Camera director** — where the eye goes, when to zoom, what to spotlight.
  Makes screen-capture-with-zoom actually good instead of nauseating.

These two directors are the only components we truly build from scratch.
Almost everything else HyperFrames provides and we configure.

---

## 4. Tech decision: HyperFrames (chosen renderer)

HeyGen's open-source HTML-to-video framework. Repo: `github.com/heygen-com/hyperframes`.
Chosen over Remotion because: (a) skill-first / agent-native design matches our
architecture, (b) LLMs author HTML more reliably than React animation trees,
(c) **Apache 2.0, no per-render fees or commercial-use thresholds** — unlike
Remotion's company-size license tier, which matters at UiPath's headcount.

Caveat: framework is weeks old (early 2026), thin docs, expect rough edges. Keep
Remotion as a mental fallback. Don't burn demo-polish time fighting framework bugs.

### What HyperFrames gives us FOR FREE (configure, don't build)
- **Renderer**: headless Chrome seeks a paused timeline frame-by-frame → FFmpeg → MP4. Deterministic.
- **`/pr-to-video` skill** — a weak version of our content director already exists. TEST IT FIRST.
- **`npx hyperframes capture`** — captures real websites to `<video>` clips (our stage 3, for browser products).
- **Media engine** — TTS voiceover, background music, SFX, Whisper caption transcription, all in one audio engine.
- **`/motion-graphics` skill + registry blocks (50+)** via `hyperframes add` — asset shells.
- **`lint` + `validate`** — structural + runtime (headless Chrome) QA gates.
- **`publish` command**, AWS Lambda cloud rendering.
- **Router skill `/hyperframes`** — capability map + intent router (tool-registry pattern, like Autopilot).

### What WE build
- Merge trigger / PR ingest
- **Content director** (enablement-narrative skill) — adds the sales layer `/pr-to-video` lacks
- **Camera director** (ROI-driven auto-zoom) — the premium-feel differentiator
- UiPath **design-token layer** + fixed-asset resolver
- Content-level QA gate (claim-checking, brand compliance)
- YouTube publish + metadata + one-pager generator + Slack ping
- Human approval gate

### Composition format (documented spec)
Plain HTML. Root `<div data-composition-id data-start data-width data-height>`.
Timed elements: `class="clip"` + `data-start` + `data-duration` + `data-track-index`.
Animation: a **paused** GSAP timeline registered to `window.__timelines[id]` so the
renderer can seek. No build step; `index.html` previews as-is.
> A working, hand-authored sample lives in `uipath-enablement-sample.html` (4 beats,
> UiPath-branded, demonstrates staggered type, blur-in, back-ease pop, spotlight
> compositing, drifting glow). Use it as the quality ceiling reference.

### Output project structure (from HeyGen's own example repos)
```
index.html        # root composition — timeline, audio tracks, sub-composition slots
meta.json         # duration, resolution, fps
SCRIPT.md         # final narration script
STORYBOARD.md     # beat-by-beat creative plan
compositions/     # per-act/scene HTML
<captured clips>  # real footage mp4s
audio/vo, /sfx, music/, fonts/, logos/
```

### Setup
Node.js 22+, FFmpeg. `npx skills add heygen-com/hyperframes --all` (or `--skill pr-to-video`).
`npx hyperframes init <name>`, `preview` (studio), `render`. Package manager: bun for repo dev.

---

## 5. Full component inventory

1. **Ingest / trigger** — merge webhook → PR title, description, diff, linked issue, commits. (build; small)
2. **Content director** — PR context → structured video plan (see §7 contract). (build; CORE IP)
3. **Capture engine + camera director** — three sub-parts:
   - *Scripting*: director's `demo_steps` → Playwright script (or reuse existing E2E test — cheapest, the test already knows the happy path).
   - *Recording*: `npx hyperframes capture` (browser products). Fallback: engineer records a clip (desktop/gated-auth features).
   - *Camera director*: **emit zoom targets DURING capture, don't guess after.** Playwright knows each interacted element's bbox → output a timed ROI track `{t, focus: bbox(x,y,w,h), action}`. Compositor eases zoom onto the box. Automate *targeting*; hand-tune *motion* (easing, hold) — bad auto-zoom is worse than none.
   - **Hidden dependency: a stable demo environment with realistic data + working auth.** Often the real blocker. For hackweek pick a feature whose staging env you control.
4. **Dynamic asset generators** (per-video, feature-specific, all consume tokens):
   callout/annotation layer (arrows/spotlight, driven by ROI track), code-defined
   diagrams (NOT model-drawn — hallucination risk), title/section cards, kinetic
   captions, optional charts, animated code-diff card (nice for eng→sales).
5. **Fixed assets + resolver + TOKEN LAYER** — UiPath kit (logo, colors, type,
   intro/outro stinger, lower-thirds, music beds) as a tagged library + resolver
   mapping abstract scene needs → concrete assets. **The design-token layer is the
   single highest-leverage thing we own** — everything on-brand for free if done well.
   (User confirmed UiPath assets are available.)
6. **Audio subsystem** — VO (TTS; its duration drives scene timing, run early),
   BGM (must **duck** under voice), SFX (whooshes, click sounds on interactions —
   cheap, big perceived-quality lift), caption timing (Whisper). Mostly config via
   HyperFrames media engine.
7. **Compositor / renderer** — HyperFrames. (free)
8. **QA / validation gate** — HyperFrames lint/validate + OUR content gate
   (narration makes no claim the diff doesn't support; brand compliance; contrast/margins).
9. **Publish / distribution** — YouTube (title/description/chapter timestamps from
   scene boundaries, unlisted, "Enablement" playlist) + **one-pager generator**
   (don't lose this — "sales understands" was the original goal) + Slack ping.
10. **Human approval gate** — capture+draft on merge, human review before customer-facing publish.

## 6. Video sections (content director output arc)

1. **Hook — the customer problem** (~5–10s). "Customers kept hitting Y," not "we shipped X."
2. **Capability + one-line value** (~8–12s). Name it, one sentence.
3. **The demo — real footage + auto-zoom** (~25–40s). The spine.
4. **Positioning — the SALES layer** (~10–15s). "Use when a customer says…", 2–3 talking points, objection handling. *Only in our version, not a generic product tour. This is why sales can sell from it. Internal cut keeps it; customer cut strips it.*
5. **Where to learn more / CTA** (~5s). Docs link, outro stinger.

## 7. Content director structured output contract

Emit a video plan (JSON) with at least:
```
feature_name, value_prop, persona, when_to_use, talking_points[]
narration_script (per scene)
scenes[]: { id, type, duration, on_screen_text, narration,
            footage_requirement?: { steps[] },
            asset_requirements[]: { need: "brand_intro"|"diagram"|"callout"|..., spec } }
youtube_metadata: { title, description, tags, chapters[] }
```
**Constraint: do NOT invent claims the diff doesn't support.** A hallucinated
benefit shown to a customer is the failure that kills trust.

## 8. Suggested hackweek build order

- **Day 1** — Spike `/pr-to-video` on a real UiPath PR. Two questions: how close is
  default output, and how hard is it to override creative direction with our brand
  tokens + enablement narrative? Also: ingest + content-director structured output.
  Build the token layer (cheap, everything compounds off it).
- **Day 2** — One-pager generator + wire TTS (VO drives timing). Capture path for
  the chosen feature (reuse E2E test if possible).
- **Day 3–4** — Composition assembly + camera director (ROI-driven zoom) +
  callouts. THIS is where "premium" is won; protect this time.
- **Day 5** — YouTube publish, demo recording, fix the one thing that breaks, pitch.

Build for real: token layer, content director, camera-director *targeting*, callout
generator, one templated diagram. Stub/config: image-model asset gen (interface only),
full two-cut renderer. Fallback ready: engineer-records-a-clip capture.

## 9. OPEN DECISIONS (resolve these first)

- **BIGGEST FORK — browser vs desktop product?** Decides the entire capture design.
  - *Browser* → Playwright auto-capture + ROI-driven zoom fully viable.
  - *Desktop/Studio app* → lean on engineer-records-a-clip + OS-level capture; auto-zoom harder.
- Is the primary win "sales doesn't KNOW about features" or "sales can't DEMO them"?
  Changes what the MVP optimizes for.
- Which feature type dominates: UI/workflow (callouts + before/after lead),
  backend/architectural (diagrams lead), or analytics (charts lead)? Decides first
  generator to build.
- Confirm UiPath brand kit contents (intro sting, color tokens, font, logo lockups)
  → seeds the token layer.
- Does the chosen demo feature have a stable staging env with good data + auth?

## 10. Known risks

- Framework is weeks old — rough edges, thin docs, example repos ship with known
  lint warnings (overlapping clips, GSAP tween overlap) that still render fine.
- Auto-zoom feel is high-value but easy to get wrong; hand-tune motion.
- Demo-environment/data is the sneaky blocker, not the video tech.
- Last-20% polish (making it *feel* premium) is disproportionately hard; don't let
  the project become an engineering exercise that runs out of polish time.

---

### First action in Claude Code
Set up the project (`npx hyperframes init`), install `--skill pr-to-video`, run it
against one real PR, and report back the default-output quality + how overridable its
creative direction is. That single test determines whether the project is "brand +
editorial on top of HyperFrames" (easy) or "author compositions ourselves via the
router" (more work). Everything else keys off that answer and the browser-vs-desktop fork.
