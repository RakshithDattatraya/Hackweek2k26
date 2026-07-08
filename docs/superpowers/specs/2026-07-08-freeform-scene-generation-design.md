# Free-Form Scene Generation + QA Self-Review Loop — Design Spec (Milestone 3)

**Date:** 2026-07-08
**Status:** Approved design (pre-implementation-plan)
**Author:** rakshith.hegde@uipath.com + Claude
**Related:** M1 `SPEC.md`, M2 `docs/superpowers/specs/2026-07-07-creative-scene-library-director-design.md`

---

## 1. Goal

Make every video **genuinely unique and premium**: the director *authors* each scene's
visual format (bespoke HTML + CSS) rather than *selecting* from fixed templates, and decides
the beats/format per feature. A quality gate + a look-at-the-frames-and-fix loop keep the
free-form output premium and on-brand before any human reviews it.

This removes the templated "same DNA" every video currently shares, and lets the director
express **any beat a story needs** — not a fixed list.

## 2. Approved decisions

- **Generation model: free-form authoring.** The director writes bespoke `html` + scoped
  `css` per scene. Maximum uniqueness.
- **Motion: full author-authored GSAP, determinism-linted (richest possible — "no stones
  unturned").** Each scene may carry an authored GSAP `motionScript` that adds tweens to the
  master paused timeline — the native HyperFrames model — giving the *complete* GSAP
  vocabulary: sequenced/nested timelines, keyframes, staggers, every ease, transform /
  clip-path / SVG-attribute tweens, number counters, build-on-build reveals, motion that
  *explains* (e.g. a diagram assembling step-by-step, a gap visibly widening). The only
  constraint is the one the renderer physically requires — the timeline must be paused,
  registered, and deterministic — enforced by the QA lint (forbids `Date.now`,
  `Math.random`, `new Date()`, network/`fetch`; everything else allowed). Rich motion,
  deterministic renders.
- **Safety net: auto-QA + self-review loop.** After authoring: structural lint + headless
  render-check + brand/contrast check; then the director inspects rendered frames, auto-fixes,
  and re-renders until clean; then the human review gate.
- The existing 8 M2 components remain available as an **optional starter kit** the director may
  reuse or ignore.

## 3. The director's creative mandate (content quality + open-ended beats)

Free-form expressiveness is only valuable if the director uses it well. The director skill
must:

- **Write genuinely strong, specific content.** Problem statements must be sharp and concrete
  to the feature — not generic. Narration is tight and human (matches UiPath voice).
- **Decide the beats/format per video.** There is no fixed arc or scene list. The director
  designs the sequence the *particular* story needs, and invents bespoke visuals for each beat.
- **Cover the full story, including beats the old system couldn't.** Illustrative examples of
  the range now expected (NOT a fixed checklist — the director adds/removes per feature):
  - a sharp, feature-specific **problem statement**;
  - **where the feature fits** — e.g. its place in the dev workflow / that this enablement
    step runs right after deploy — rendered as a bespoke workflow graphic;
  - **engineers marketing their own feature** — the builder-mindset framing;
  - positioning / right-fit-customer / objection handling;
  - and **any other creative beat** the feature warrants, with graphics generated to suit.
- **Ground every claim in the source** (no invented benefits/metrics) — unchanged from M1/M2.

These examples live in the skill as guidance/inspiration, not as hardcoded scene types.

## 4. Architecture & the free-form scene contract

Same brain/renderer split; the brain now authors scenes, and a QA loop sits between render and
human.

```
prompt/PR ─▶ [director skill] authors bespoke scenes, decides beats (grounded in source)
                 │  plan.v3.json: scenes carry authored html + scoped css + motion spec + narration
                 ▼
          [build] inject brand tokens (CSS vars) → scope each scene's css → compile motion spec
                 → assemble composition → render MP4
                 ▼
          [QA gate] structural lint · headless render-check (JS errs, missing assets, overflow) · brand/contrast
                 ▼
          [self-review loop] director inspects frames → fixes html/css → re-render, until clean or cap
                 ▼
          reviewable draft ─▶ HUMAN review
```

**Free-form scene (VideoPlan v3):**
```
CustomScene = {
  id: string,
  html: string,              // bespoke inner HTML; may/should use --uip-* vars in inline styles
  css?: string,              // scene-scoped CSS (auto-scoped to this scene; may/should use --uip-* vars)
  motionScript?: string,     // authored GSAP body, run as (tl, root, start) => { … } — adds tweens to the
                             // master paused timeline, offset by the scene's start; full GSAP, lint-gated
  narration: string          // drives duration (VO-driven timing, unchanged)
}
```
The builder splices each scene's `motionScript` into the master timeline via a fixed wrapper
`(tl, root, start) => { <motionScript> }`, where `tl` is the paused master timeline, `root` is
the scene element, and `start` is its computed start time. The author writes e.g.
`tl.from(root.querySelectorAll('.step'), { autoAlpha: 0, y: 30, stagger: 0.2 }, start + 0.3)`.
```
```
- A scene is either a `component` reference (M2 starter kit) OR a `custom` free-form scene.
  `plan.v3.json` allows both; v2/v1 remain valid (additive).
- Duration stays VO-driven; the builder still wraps each scene in a `class="clip"` element with
  the mandatory timing attributes and registers the paused timeline — the author supplies inner
  content, not the timing/harness plumbing.

## 5. Keeping free-form on-brand

Brand is no longer enforced by fixed templates, so it is enforced three ways:
1. **Tokens as CSS custom properties** — `--uip-orange`, `--uip-teal`, `--uip-deep-blue`,
   `--uip-white`, font families, injected into the composition `<head>`. The skill *requires*
   authored CSS to use these variables, never hardcoded off-brand hex.
2. **Brand-compliance check** (in the QA gate) — colors drawn from the palette (or token vars);
   text meets contrast ratios; content stays within a safe margin of the 1920×1080 frame.
3. **Skill creative principles** — the "premium UiPath look" (dual-glow deep-blue backgrounds,
   Poppins/Inter type scale, spacing rhythm, restrained accent use) described as *principles*
   the author applies, not a locked template.

## 6. The QA gate (built for real this milestone)

Leans on HyperFrames' own tools plus our checks; any failure blocks and returns specific,
fixable errors keyed to the offending scene:
- **Structural lint** — every timed element has `class="clip"` + `data-start`/`data-duration`/
  `data-track-index`; timeline paused + registered; and each `motionScript` is
  **determinism-safe**: forbids `Date.now`, `Math.random`, `new Date(`, `fetch`/`XMLHttpRequest`,
  and dynamic `import(` — full GSAP otherwise allowed. Uses HyperFrames `lint` + our
  forbidden-token scan.
- **Runtime render-check** — headless Chrome: no JS errors, no missing/404 assets, and no
  element/text overflowing the 1920×1080 frame (HyperFrames `validate` + an overflow probe
  measuring bounding boxes against the canvas).
- **Brand/contrast** — palette adherence, WCAG-ish text-contrast ratio on text vs. its
  background, and safe-margin compliance.

## 7. Self-review loop + human gate

After the structural gate passes, the director (skill-orchestrated) runs a bounded loop:
1. Render (or `snapshot` key frames per scene).
2. **Inspect the frames** — look for overlaps, awkward wrapping, weak hierarchy, off-canvas
   content, weak contrast.
3. Fix the offending scene's `html`/`css`/`motion`.
4. Re-render/re-snapshot. Repeat until clean or an iteration cap (e.g. 3) is hit; if the cap is
   hit with unresolved issues, surface them to the human rather than loop forever.
Then the draft goes to the **human review gate** (unchanged: capture-not-publish; a person
signs off before anything customer-facing).

## 8. Repo structure

```
src/
  scenes/
    custom.ts                 # free-form scene: scoped-CSS injection + declarative-motion compile
    registry.ts               # MODIFY: dispatch `custom` scenes alongside component scenes
  content-director/plan-schema.ts   # MODIFY: add CustomSceneSchema + VideoPlanV3 (additive)
  compose/build-composition-v2.ts   # MODIFY: inject token CSS vars; render custom scenes; compile motion
  qa/
    lint.ts                   # structural checks (clip attrs, timeline, no raw JS)
    render-check.ts           # headless validate + overflow probe (wraps hyperframes validate/inspect)
    brand-check.ts            # palette + contrast + safe-margin
    gate.ts                   # runs all three, returns a keyed QAReport (blocks on failure)
  pipeline/build-plan.ts      # MODIFY: run the QA gate after render; expose snapshot for self-review
.claude/skills/enablement-video/SKILL.md   # v2 → free-form authoring + self-review protocol + creative mandate (§3)
fixtures/sample-plan.v3.json  # golden free-form plan for tests
```

## 9. Testing strategy

- **Unit:** `motionScript` splice + forbidden-token lint (allows `tl.from(...)` GSAP; rejects a
  script containing `Date.now`/`Math.random`/`new Date(`/`fetch`); wrapper `(tl, root, start)`
  is applied with the correct start offset); CSS scoping (a scene's css can't leak to siblings);
  overflow probe (flags an element wider than 1920 / taller than 1080); brand/contrast check
  (fails low-contrast, passes on-brand); QA gate aggregation (one failing check fails the gate
  with the scene id).
- **Integration:** a checked-in free-form `fixtures/sample-plan.v3.json` → build → QA gate
  PASSES → renders `renders/video.mp4` with video + audio. Uses the `say` fallback voice so it
  runs without the premium voice.
- **Visual QA:** frame montage of the fixture render, reviewed against brand tokens.

## 10. Error handling & fallbacks

- QA failure → gate returns specific errors keyed to the scene; the self-review loop attempts
  fixes; if the cap is hit, the draft + the unresolved QA notes go to the human (never silently
  ship a failing frame).
- Author CSS referencing a missing token var → falls back to the browser default; the
  brand-check flags off-palette results.
- Raw `<script>`/JS detected in authored html → lint fails (declarative motion only).
- Render error on a custom scene → surfaces the scene id; build fails rather than emitting a
  blank/broken scene.

## 11. Out of scope (this milestone)

- Real Playwright product-demo capture + ROI camera director.
- SFX / music bed.
- Runtime LLM-API director (the agent/skill remains the brain).
- PR/Jira ingest adapters (prompt-driven; adapters feed the same context later).
- One-pager generator, YouTube publish, Slack, merge webhook (still stubs from earlier specs).

## 12. Open items (resolve during planning)

- The exact forbidden-token list + how `motionScript` is spliced/executed safely (a `new
  Function("tl","root","start", script)` invocation vs. inlining into the composition `<script>`);
  confirm the lint reliably catches obfuscated non-deterministic calls.
- Whether any premium GSAP plugins (DrawSVG / MorphSVG / MotionPath) are worth bundling for even
  richer "explanatory" motion, or core GSAP suffices (it covers most of it).
- CSS-scoping mechanism (prefix selectors with a per-scene id vs. shadow-DOM-like wrapper) that
  survives the HyperFrames renderer.
- Overflow-probe implementation (bounding-box measurement in `validate`/`inspect` vs. a
  dedicated headless check).
- Contrast-check rigor (strict WCAG AA vs. a lighter luminance-difference heuristic).
- Self-review loop mechanics: how the skill drives snapshot→inspect→fix (tooling the pipeline
  exposes vs. steps the agent runs).
