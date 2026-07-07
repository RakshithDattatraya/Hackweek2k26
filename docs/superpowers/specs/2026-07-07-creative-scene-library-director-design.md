# Creative Scene Library + Director Skill — Design Spec (Milestone 2)

**Date:** 2026-07-07
**Status:** Approved design (pre-implementation-plan)
**Author:** rakshith.hegde@uipath.com + Claude
**Related:** `SPEC.md` (Milestone 1), `docs/superpowers/plans/2026-07-07-enablement-video-milestone-1.md`, `demo/build-video.ts` (prototype)

---

## 1. Goal

Make the pipeline **automatically produce premium, creative videos** from a prompt (or PR/Jira),
instead of the Milestone-1 baseline that emits plain text cards. All the creative treatments
prototyped by hand in `demo/build-video.ts` — the authentic Slack scene, the gap metaphor,
flow diagrams, capability lists, cinematic motion, kinetic captions, premium voice — become
**reusable pipeline capabilities** that apply on every run, selected and filled by a
Claude **director skill**.

Success: a user (or an automated Claude Code agent on merge) prompts the director skill; it
authors an adaptive plan choosing creative scene components and writing their content; the
deterministic renderer turns it into an on-brand MP4 with motion, captions, and the Ava
premium voice — with no per-video hand-authoring.

## 2. Approved decisions

- **Director brain = a Claude skill** (agent-native, matches HyperFrames' `/pr-to-video`).
  The agent running the skill IS the LLM — no API key required. Works for a human running
  Claude Code, or an automated Claude Code agent triggered on merge.
- **Fully adaptive structure** — the director freely chooses the number, order, and type of
  scenes per feature. Guardrail: strict validation (see §7), not a forced arc.
- **Chosen approach: A** — component registry + enriched VideoPlan v2 + director skill;
  motion/captions/voice baked into the build as defaults.

## 3. Architecture

```
prompt / PR / Jira
      │
      ▼
[ Claude director skill: enablement-video ]     ← the brain (creative direction encoded here)
   picks components, writes content, orders scenes freely, grounds claims in source
      │
      ▼
   plan.v2.json  ── validated against registry + per-component props schemas
      │
      ▼
[ deterministic build: src/pipeline/build-plan.ts ]
   VO (Ava premium) → transcribe → compose (scene registry) → kinetic captions → render
      │
      ▼
   renders/video.mp4   (on-brand, narrated, captioned)
```

Clean split: a **brain** (skill) and a **deterministic renderer** (component library + build),
connected by one contract — the enriched VideoPlan v2.

## 4. Enriched VideoPlan v2 (the contract)

Each scene becomes a component reference with props, instead of Milestone-1's fixed
`type + on_screen_text`:

```
Scene = {
  id: string,
  component: string,              // must exist in the scene registry
  props: object,                  // validated against that component's own zod schema
  narration: string,              // drives scene duration (VO-driven timing)
  motion?: { pushScale?: number, pushY?: number, ease?: string, autoZoom?: boolean }
}

VideoPlanV2 = {
  feature_name, value_prop, persona, when_to_use, talking_points[],   // retained for one-pager/publish
  scenes: Scene[],                // any order/count — fully adaptive
  youtube_metadata: { title, description, tags, chapters[] }
}
```

- No fixed arc; `scenes[]` is whatever the director designs.
- Duration is VO-driven (from `narration`) — pacing stays automatic.
- `on_screen_text` is gone; visible content lives in each component's `props`.
- Milestone-1's `VideoPlanSchema` is retained (or versioned) for backward compatibility of
  the existing baseline path; v2 is additive. The build command consumes v2.

## 5. Scene-component library

`src/scenes/<component>.ts` — each component is one focused unit:

```
export const slack = {
  propsSchema: z.object({ channel: z.string(), members: z.number(), messages: z.array(...) }),
  render(props, tokens): string   // returns inner HTML; animatable children carry class="anim"
}
```

`src/scenes/registry.ts` maps `name → component`. The director's vocabulary is exactly what's
registered; adding a scene type = add one file + one registry entry.

Initial set (promoted from the working prototype):

| component | props |
|-----------|-------|
| `intro` | `{ tagline }` |
| `slack` | `{ channel, members, messages[]{ color, initials, name, time, text } }` |
| `statement` | `{ eyebrow, eyebrowColor?, headline, highlight?, sub? }` |
| `gap` | `{ eyebrow, headline, left{icon,title,sub}, right{icon,title,sub}, chasmLabel }` |
| `flow` | `{ eyebrow, nodes[]{icon,label}, highlightIndex? }` |
| `capability` | `{ eyebrow, items[]{icon,title,desc} }` |
| `bigstat` | `{ eyebrow, number, unit?, caption }` (new: count-up stat, e.g. "weeks → minutes") |
| `cta` | `{ headline, logo? }` |

Every component reads colors/fonts from `BrandTokens` (single source of truth) — no hardcoded
brand values.

## 6. Director skill + run flow

A Claude skill at `.claude/skills/enablement-video/SKILL.md`. Its instructions encode the
creative direction so it applies automatically every run:

- The component vocabulary and when to use each (e.g., a customer-pain hook → `slack`;
  a before/after metric → `bigstat`; an architecture beat → `flow`).
- Taste guidance (authentic Slack treatment; tight sales narrative even when adaptive).
- **Hard rule (inherited from Milestone 1):** never invent a claim the source doesn't
  support; for a manual prompt, the provided text is the only evidence.
- Output: `plan.v2.json` (validated), then invoke the build command.

Run flow: user (or automated agent) prompts the skill → skill writes `plan.v2.json` →
`bun run src/pipeline/build-plan.ts plan.v2.json` → VO → transcribe → compose → render → MP4.
The creativity rides along because it lives in the skill + library, not in a one-off script.

## 7. Motion, captions, voice, and the validation gate (defaults)

Baked into `build-plan.ts`, not re-coded per video:

- **Motion:** push-in on every scene; auto-zoom on scenes with `motion.autoZoom` (or default-on
  for `slack`); staggered content entrance. Per-scene `motion` overrides the defaults.
- **Captions:** auto-transcribe the VO (whisper via `hyperframes transcribe`) → kinetic
  word-synced captions.
- **Voice:** Ava (Premium) via the `SpeechSynthesizer` seam (configurable; falls back to a
  standard `say` voice if the premium voice is absent).
- **Validation gate (the guardrail for fully-adaptive):** before rendering, validate the plan —
  every scene's `component` must exist in the registry, and its `props` must pass that
  component's zod schema. Unknown component or bad props → fail loudly with a clear message,
  never a broken frame. Plus the Milestone-1 content check (no unsupported claims).

## 8. Repo structure

```
Hackweek2k26/
  src/
    scenes/
      registry.ts               # name → { render, propsSchema }
      intro.ts slack.ts statement.ts gap.ts flow.ts capability.ts bigstat.ts cta.ts
    content-director/
      plan-schema.ts            # + VideoPlanV2Schema (additive to v1)
    compose/
      build-composition.ts      # v2: dispatch scene.component via registry, apply motion
    audio/ …                    # (reused: tts seam, assemble-audio)
    pipeline/
      build-plan.ts             # orchestrator: plan.v2.json → VO → transcribe → compose → render
  .claude/skills/enablement-video/
      SKILL.md                  # the director (creative direction encoded)
  fixtures/
      sample-plan.v2.json       # golden enriched plan for tests
```

Reuses Milestone-1's `token-resolver`, `tts`, `assemble-audio`, `render`, and the caption
approach proven in the prototype.

## 9. Testing strategy

TDD per unit; one integration test.

- **Unit:** each scene component (sample props → HTML containing its key content and the
  mandatory `class="clip"`/timing attributes via the builder); registry lookup + props
  validation (unknown component throws; bad props throw); VideoPlanV2 schema.
- **Integration:** a checked-in `fixtures/sample-plan.v2.json` (a few varied components) →
  `build-plan.ts` → assert a valid `renders/video.mp4` with video + audio streams.
  Feature-agnostic; uses the `say` fallback voice so it runs without the premium voice.
- **Visual QA:** frame montage of the fixture render, reviewed against brand tokens.

## 10. Error handling & fallbacks

- Unknown component / invalid props → validation gate fails with the offending scene id and
  reason; no render attempted.
- Premium voice absent → fall back to a standard `say` voice (pipeline still produces audio).
- Transcribe unavailable → captions skipped (`--optional`), video still renders.
- Component render error → surfaces the scene id; build fails rather than emitting a blank scene.

## 11. Out of scope (this milestone)

- Real Playwright product-demo capture + ROI camera director (separate follow-on).
- SFX / music bed.
- Runtime LLM-API director (the skill/agent is the brain here; an API adapter is a later option).
- PR/Jira ingest adapters (prompt-driven first; the director accepts a `SourceContext`, so
  adapters slot in later without director changes).
- Two-cut (customer) rendering; publish/YouTube.

## 12. Open items (resolve during planning)

- Final `bigstat` count-up animation approach (GSAP number tween vs. stepped).
- Whether to version `plan-schema.ts` (v1 + v2 side by side) or migrate the baseline to v2.
- Exact SKILL.md component-selection heuristics (which cues map to which components).
- Caption legibility over the tall `capability`/`flow` scenes (may need a reserved bottom band).
