# Scene Transitions + Caption Safe-Band + Director Quality Bar — Design Spec (Milestone 4)

**Date:** 2026-07-08
**Status:** Approved design (pre-implementation-plan)
**Author:** rakshith.hegde@uipath.com + Claude
**Related:** M3 `docs/superpowers/specs/2026-07-08-freeform-scene-generation-design.md`

---

## 1. Goal

Make the output read as a **continuous film, not a slideshow**: authored cross-scene
transitions animate across every seam (no hard cuts), captions never overlap content, and the
director produces a **detailed, top-notch** video where every section is fully developed and
premium.

This closes the last "slide tell" (hard cuts between scenes) and raises the content bar.

## 2. Approved decisions

- **Free-form seam transitions.** Each scene may carry an authored GSAP `transitionOut` (how
  it leaves) + a `transitionOverlap` (seconds it lingers into the next). The incoming scene's
  `motionScript` is its "in." Both play during the overlap → an authored crossfade / push /
  wipe / scale-through. No `transitionOut` = clean hard cut (back-compatible).
- **Builder overlaps windows + alternates track-index.** A scene's clip window is extended by
  its `transitionOverlap`; adjacent scenes alternate `data-track-index` (0,1,0,1…) so the
  intentional overlap is lint-legal (avoids the "overlapping clips on the same track" error)
  and the incoming scene renders above the outgoing one.
- **`transitionOut` is determinism-linted** exactly like `motionScript`.
- **Caption safe-band.** Content lives in the top region; captions sit in a reserved bottom
  band with a gradient scrim — never overlapping content.

## 3. Director quality bar (detailed + top-notch)

The director skill must produce a **detailed, premium** video — not thin cards:

- **Every section is fully developed.** A clear focal idea, supported by concrete, specific
  content (real examples, specific phrasing), not a bare headline. Depth per beat.
- **The video is comprehensive.** It tells the whole story richly — problem, stakes, insight,
  the mechanism, where it fits, the payoff, the trust model, CTA — each beat earning its place.
- **Top-notch production values.** Considered layout and hierarchy, purposeful motion that
  *explains* (not decoration), smooth authored transitions between every scene, on-brand type
  and color, generous spacing.
- **Restraint alongside detail.** Detailed ≠ cluttered: one clear focal point per scene,
  content within the caption safe-band, restrained accent use. Rich, not busy.
- **Self-review enforces the bar.** In the snapshot→inspect→fix loop, the director rejects thin,
  weak, cluttered, or flat scenes and improves them before the human sees the draft.

These are principles in the skill, applied per feature — not a fixed template.

## 4. Transition mechanism

**Scene fields (added to the v3 custom scene; optional):**
```
transitionOut?: string     // authored GSAP: runs as (tl, root, at) => { … }; animates THIS scene
                           //   leaving, starting at `at` (the scene's content-end time)
transitionOverlap?: number // seconds this scene lingers past its content into the next (default 0
                           //   = hard cut; typical 0.5–0.8 for a transition)
```

**Builder mechanics:**
1. **Window overlap.** Scene i's clip `data-duration` = `D_i + transitionOverlap_i` (last scene:
   no overlap). So scene i stays visible from `S_i` until `S_{i+1} + overlap`, i.e. it lingers
   while scene i+1 (starting at `S_{i+1}`) enters. Cumulative starts `S_i` remain VO-driven and
   contiguous (unchanged); only the visible tail is extended.
2. **Alternating track-index.** Scene i gets `data-track-index = i % 2`. Adjacent scenes are on
   different tracks, so their overlapping windows are lint-legal, and the later scene renders on
   top (incoming above outgoing).
3. **Splice `transitionOut`.** Wrapped `(function(tl, root, at){ <transitionOut> })(tl,
   document.querySelector('[data-sid="<id>"]'), <S_i + D_i>)` — animates the outgoing scene from
   its content-end through the overlap. The incoming scene's own `motionScript` (offset at
   `S_{i+1}`) provides the "in." Together: a free-form seam transition.

**Z-order / correctness:** the alternating track-index must resolve so the incoming scene paints
above the outgoing one during the overlap (later-in-DOM + higher track). If HyperFrames' track
model doesn't guarantee this, fall back to an explicit `z-index` tied to scene order (planning
open item §11).

## 5. Caption safe-band

- **Reserved layout.** `.inner` content is constrained to the top region (≈ top 900px, centered
  there) so it never enters the caption zone.
- **Caption band + scrim.** Captions sit in the bottom band (≈ bottom 60–170px) over a subtle
  bottom-up gradient scrim (`linear-gradient(transparent → rgba(0,0,0,.55))`) so kinetic captions
  stay legible over any scene — including the white Slack window — without overlapping content.

## 6. QA extensions

- **Determinism lint** now also scans each scene's `transitionOut` for the forbidden tokens
  (`Date.now`, `Math.random`, `new Date(`, `fetch(`, `XMLHttpRequest`, `import(`).
- **Track-overlap check** (render-check): assert that any two clips whose windows overlap have
  *different* `data-track-index` — so intentional transition overlaps never produce the
  same-track error, and an accidental same-track overlap still fails.
- Existing checks (brand palette, structural lint, hyperframes lint/validate) unchanged.

## 7. Repo structure

```
src/
  content-director/plan-schema.ts     # MODIFY: add transitionOut?/transitionOverlap? to CustomScene (+ allow on component scenes via a shared shape)
  compose/build-composition-v2.ts     # MODIFY: window overlap (+overlap tail), data-track-index = i%2, splice transitionOut; caption safe-band + scrim CSS; content top-region constraint
  qa/lint.ts                          # MODIFY: lint transitionOut too
  qa/render-check.ts                  # MODIFY (or new qa/track-check.ts): overlapping-windows-must-differ-in-track assertion
  qa/gate.ts                          # MODIFY: include the track check
.claude/skills/enablement-video/SKILL.md   # MODIFY: transition guidance + the detailed/top-notch quality bar (§3)
fixtures/sample-plan.v4.json          # NEW: golden plan with authored transitions
```

## 8. Testing strategy

- **Unit:** window-overlap math (scene i duration = D_i + overlap; last scene unchanged; starts
  still contiguous); alternating track assignment (`i % 2`); `transitionOut` spliced with the
  correct `at` offset; determinism lint flags a bad `transitionOut`; the track-overlap check
  passes for alternating tracks and fails for same-track overlap; caption safe-band + scrim CSS
  present; content constrained to the top region.
- **Integration:** a checked-in `fixtures/sample-plan.v4.json` (scenes with authored
  transitions) → build → QA gate PASSES (incl. track check) → renders `renders/video.mp4` with
  video + audio. Uses `say` fallback voice.
- **Visual QA:** frame montage sampled *across the seams* (mid-transition) to confirm the
  crossfade/push actually renders two scenes blending, plus captions clear of content.

## 9. Error handling & fallbacks

- No `transitionOut`/`transitionOverlap` → hard cut, single track continues to work
  (back-compatible with M1–M3 plans).
- `transitionOut` with a forbidden token → determinism lint fails, keyed to the scene.
- Overlapping windows on the same track (e.g. a bug) → track-check fails loudly.
- Overlap extending a scene past the video end → clamp the last scene's overlap to 0.

## 10. Out of scope (this milestone)

- Element *continuity* across scenes (a specific element morphing/carrying between scenes).
- Real Playwright demo capture; SFX/music; runtime LLM-API director; PR/Jira adapters;
  one-pager/publish (still stubs from earlier specs).

## 11. Open items (resolve during planning)

- Confirm HyperFrames' track-index → z-order behavior during overlap; if it doesn't guarantee
  incoming-on-top, add explicit `z-index` by scene order.
- Exact caption-band dimensions + content top-region height that read well at 1080p.
- Whether `transitionOverlap` should be a fixed default (e.g. 0.6s) or fully per-scene; and
  whether the incoming scene needs an explicit `transitionIn` or its `motionScript` suffices.
- Whether the track-overlap check lives in `render-check.ts` or a small dedicated
  `qa/track-check.ts`.
