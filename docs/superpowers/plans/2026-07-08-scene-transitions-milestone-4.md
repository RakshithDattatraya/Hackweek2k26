# Scene Transitions + Caption Safe-Band + Director Quality Bar — Implementation Plan (Milestone 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the video read as a continuous film — authored cross-scene transitions animate across every seam, captions never overlap content, and the director produces a detailed, top-notch cut.

**Architecture:** Each scene gains an optional authored `transitionOut` (GSAP) + `transitionOverlap` (seconds). The builder extends a scene's clip window by its overlap (so it lingers while the next enters), alternates `data-track-index` (0,1,0,1…) + sets `z-index` by scene order so the overlap is lint-legal and the incoming scene paints on top, and splices `transitionOut` into the timeline. Captions move to a reserved bottom band with a gradient scrim; content is constrained to the top region. HyperFrames' own `lint` (via render-check) already validates that overlapping clips are on different tracks — no new QA module needed.

**Tech Stack:** TypeScript, bun (`bun test`), zod, HyperFrames CLI, FFmpeg, GSAP (authored, determinism-linted).

## Global Constraints

- **Node 22+ for HyperFrames** (render/lint/validate); keep `nvm use stable` active or set `HYPERFRAMES_NODE_BIN`.
- **bun** runtime; tests `bun test`; TS run directly.
- **Brand tokens = single source of truth** via `--uip-*` CSS vars; authored CSS/HTML never hardcodes off-brand 6-digit hex.
- **HyperFrames rules:** every timed element `class="clip"` + `data-start`/`data-duration`/`data-track-index`; GSAP timeline `paused` + registered on `window.__timelines["feature-video"]`.
- **Determinism (hard):** authored `motionScript` AND `transitionOut` must not contain `Date.now`, `Math.random`, `new Date(`, `fetch(`, `XMLHttpRequest`, `import(`.
- **Overlapping clips MUST be on different tracks** (HyperFrames lint errors on same-track overlap). Alternate `data-track-index = i % 2`.
- **Back-compatible:** no `transitionOut`/`transitionOverlap` → hard cut; v1/v2/v3 plans still build.
- **Canvas 1920×1080 @ 30fps; VO-driven durations.**

---

## File Structure

```
src/content-director/plan-schema.ts   # MODIFY: + transitionOut?/transitionOverlap? on SceneV2Schema & CustomSceneSchema
src/compose/build-composition-v2.ts   # MODIFY: window-overlap tail, track = i%2, z-index = i, splice transitionOut, caption safe-band + scrim, content top-region
src/qa/lint.ts                        # MODIFY: also scan transitionOut for forbidden tokens
src/pipeline/build-plan.ts            # (unchanged logic; validatePlanV3 already used) — exercised by the v4 fixture
fixtures/sample-plan.v4.json          # NEW: golden plan with authored transitions
.claude/skills/enablement-video/SKILL.md   # MODIFY: transition guidance + detailed/top-notch quality bar
```

---

## Task 1: Schema — transition fields

**Files:** Modify `src/content-director/plan-schema.ts`; Test `src/content-director/plan-schema-v4.test.ts`

**Interfaces:**
- Adds optional `transitionOut: string` and `transitionOverlap: number (>=0)` to BOTH `SceneV2Schema` and `CustomSceneSchema` (so either scene kind can declare a seam transition). `validatePlanV3` unchanged (its union picks these up).

- [ ] **Step 1: Write the failing test**

Create `src/content-director/plan-schema-v4.test.ts`:

```ts
import { test, expect } from "bun:test";
import { validatePlanV3 } from "./plan-schema";

const base = { feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } };

test("custom scene accepts transitionOut + transitionOverlap", () => {
  const p = validatePlanV3({ ...base, scenes: [
    { id: "a", html: "<h1>A</h1>", narration: "n", transitionOut: "tl.to(root,{xPercent:-100},at)", transitionOverlap: 0.7 },
    { id: "b", html: "<h1>B</h1>", narration: "n" },
  ] });
  expect((p.scenes[0] as any).transitionOverlap).toBe(0.7);
});

test("component scene accepts transitionOut + transitionOverlap", () => {
  const p = validatePlanV3({ ...base, scenes: [
    { id: "s", component: "cta", props: { headline: "x" }, narration: "n", transitionOut: "tl.to(root,{autoAlpha:0},at)", transitionOverlap: 0.5 },
  ] });
  expect((p.scenes[0] as any).transitionOut).toContain("autoAlpha");
});

test("negative transitionOverlap is rejected", () => {
  expect(() => validatePlanV3({ ...base, scenes: [{ id: "a", html: "<h1>A</h1>", narration: "n", transitionOverlap: -1 }] })).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/content-director/plan-schema-v4.test.ts`
Expected: FAIL — fields stripped/rejected (unknown keys) so assertions fail.

- [ ] **Step 3: Write minimal implementation**

In `src/content-director/plan-schema.ts`, add the two fields to `SceneV2Schema` and to `CustomSceneSchema` (add these lines inside each `z.object({ ... })`):

```ts
  transitionOut: z.string().optional(),
  transitionOverlap: z.number().nonnegative().optional(),
```

(For `SceneV2Schema` put them alongside `motion`; for `CustomSceneSchema` alongside `motionScript`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/content-director/plan-schema-v4.test.ts src/content-director/plan-schema-v3.test.ts src/content-director/plan-schema-v2.test.ts`
Expected: PASS (new + v3 + v2 regression all green).

- [ ] **Step 5: Commit**

```bash
git add src/content-director/plan-schema.ts src/content-director/plan-schema-v4.test.ts
git commit -m "feat: add transitionOut/transitionOverlap to scene schemas"
```

---

## Task 2: Builder — transitions, tracks, z-order, caption safe-band

**Files:** Modify `src/compose/build-composition-v2.ts`; Test `src/compose/build-composition-v4.test.ts`

**Interfaces:**
- `buildCompositionV2` signature unchanged. New behavior: (1) scene i clip `data-duration = dur + overlap` (except the last scene → no overlap); (2) `data-track-index = i % 2`; (3) inline `z-index:${i}` on each scene; (4) if `transitionOut` present, splice `(function(tl,root,at){ <transitionOut> })(tl, document.querySelector('[data-sid="<id>"]'), <contentEnd>)` where `contentEnd = start + dur`; (5) captions: `.scene` reserves a bottom band (`padding-bottom`), a `.capscrim` gradient sits behind captions, `.cap` above it.

- [ ] **Step 1: Write the failing test**

Create `src/compose/build-composition-v4.test.ts`:

```ts
import { test, expect } from "bun:test";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildCompositionV2 } from "./build-composition-v2";
import { loadBrandTokens } from "../brand/token-resolver";

const outDir = join(process.cwd(), "out/test-compose-v4");
const plan = { feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  scenes: [
    { id: "a", html: "<h1>A</h1>", narration: "n", duration: 4, transitionOut: "tl.to(root,{xPercent:-100},at)", transitionOverlap: 0.6 },
    { id: "b", html: "<h1>B</h1>", narration: "n", duration: 3 },
  ],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } } as any;

test("transitions: overlap tail, alternating tracks, z-index, splice, caption band", () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const { indexPath } = buildCompositionV2(plan, loadBrandTokens(), outDir, {});
  const html = readFileSync(indexPath, "utf8");
  // scene a: start 0, content dur 4, +0.6 overlap → data-duration 4.60; scene b: 3.00 (last, no overlap)
  expect(html).toContain('data-sid="a"');
  expect(html).toMatch(/data-sid="a"[^>]*data-duration="4.60"/);
  expect(html).toMatch(/data-sid="b"[^>]*data-duration="3.00"/);
  // alternating tracks
  expect(html).toMatch(/data-sid="a"[^>]*data-track-index="0"/);
  expect(html).toMatch(/data-sid="b"[^>]*data-track-index="1"/);
  // z-index by order
  expect(html).toMatch(/data-sid="b"[^>]*z-index:1/);
  // transitionOut spliced at content-end (a ends at 4.00)
  expect(html).toContain("(function(tl, root, at)");
  expect(html).toContain("xPercent:-100");
  // caption safe-band scrim present
  expect(html).toContain("capscrim");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/compose/build-composition-v4.test.ts`
Expected: FAIL — no overlap tail / alternating track / z-index / transition splice / capscrim yet.

- [ ] **Step 3: Write minimal implementation**

In `src/compose/build-composition-v2.ts`:

(a) Add a `transitionSplices: string[] = []` array next to the existing `motionSplices`/`sceneCss` arrays.

(b) In the scene `.map((s, i) => { ... })`, after computing `start` and `dur` (the rounded content duration), add overlap + track + z-index + transition splice, and use `winDur` for `data-duration`:

```ts
    const isLast = i === plan.scenes.length - 1;
    const overlap = isLast ? 0 : Math.max(0, s.transitionOverlap ?? 0);
    const winDur = dur + overlap;
    const track = i % 2;
    if (s.transitionOut) {
      transitionSplices.push(
        `      (function(tl, root, at){ ${s.transitionOut} })(tl, document.querySelector('[data-sid="${sid}"]'), ${(start + dur).toFixed(2)});`);
    }
```

Then change the returned `<div>`: use `data-duration="${winDur.toFixed(2)}"`, `data-track-index="${track}"`, and add `z-index:${i}` to the inline `style` (e.g. `style="z-index:${i};background:${GLOW}, ${t.deepBlue}"`). Keep `data-sid`, `data-start`, `data-stagger`, `data-ps/py/pe`, `data-own-motion`, and `.inner` as they are.

(c) In the timeline `<script>`, emit the transition splices right after the motion splices (before `window.__timelines[...] = tl;`):

```
${motionSplices.join("\n")}
    // authored seam transitions (outgoing scene animates out during the overlap)
${transitionSplices.join("\n")}
    window.__timelines["feature-video"] = tl;
```

(d) Caption safe-band. In the `<style>`:
- change the `.scene` rule to reserve a bottom band: add `padding-bottom:180px;box-sizing:border-box` to the existing `.scene{...}` rule.
- update `.cap` to sit in the band (`bottom:56px`) and keep `z-index:50`.
- add: `.capscrim{position:absolute;left:0;right:0;bottom:0;height:220px;background:linear-gradient(transparent, rgba(0,0,0,.6));z-index:40;pointer-events:none}` and `.footer{... z-index:45}`.

And in the `<body>` `#master-root`, add the scrim element just before the caption HTML block:

```
    <div class="capscrim"></div>
${opts.captionHtml ?? ""}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/compose/build-composition-v4.test.ts src/compose/build-composition-v3.test.ts src/compose/build-composition-v2.test.ts`
Expected: PASS (v4 + v3 + v2 regression all green).

- [ ] **Step 5: Commit**

```bash
git add src/compose/build-composition-v2.ts src/compose/build-composition-v4.test.ts
git commit -m "feat: seam transitions (overlap+alternating tracks+splice) and caption safe-band"
```

---

## Task 3: QA lint — cover transitionOut

**Files:** Modify `src/qa/lint.ts`; Test `src/qa/lint-transition.test.ts`

**Interfaces:**
- `lintPlan` now scans each scene's `transitionOut` (in addition to `motionScript`) for the forbidden tokens, keyed to the scene id.

- [ ] **Step 1: Write the failing test**

Create `src/qa/lint-transition.test.ts`:

```ts
import { test, expect } from "bun:test";
import { lintPlan } from "./lint";

const mk = (scene: any) => ({ feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  scenes: [scene], youtube_metadata: { title: "", description: "", tags: [], chapters: [] } } as any);

test("forbidden token in transitionOut is flagged with scene id", () => {
  const f = lintPlan(mk({ id: "t1", html: "<h1>x</h1>", narration: "n", transitionOut: "tl.to(root,{x:Math.random()},at)" }));
  expect(f.length).toBe(1);
  expect(f[0].sceneId).toBe("t1");
  expect(f[0].message).toContain("Math.random");
});

test("clean transitionOut passes", () => {
  expect(lintPlan(mk({ id: "t1", html: "<h1>x</h1>", narration: "n", transitionOut: "tl.to(root,{xPercent:-100},at)" }))).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/qa/lint-transition.test.ts`
Expected: FAIL — `transitionOut` not scanned (first test finds 0 findings).

- [ ] **Step 3: Write minimal implementation**

In `src/qa/lint.ts`, update `lintPlan` so it also checks `transitionOut`. Replace the per-scene body so it scans both fields:

```ts
export function lintPlan(plan: VideoPlanV3): QAFinding[] {
  const findings: QAFinding[] = [];
  for (const s of plan.scenes) {
    const scripts: [string, string | undefined][] = [
      ["motionScript", (s as any).motionScript],
      ["transitionOut", (s as any).transitionOut],
    ];
    for (const [field, script] of scripts) {
      if (!script) continue;
      for (const f of FORBIDDEN) {
        if (f.re.test(script)) {
          findings.push({ check: "determinism-lint", sceneId: s.id, message: `${field} uses forbidden non-deterministic call: ${f.name}` });
        }
      }
    }
  }
  return findings;
}
```

(This drops the `isCustomScene` guard — reading `motionScript`/`transitionOut` off any scene via optional access is safe; component scenes simply have neither.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/qa/lint-transition.test.ts src/qa/lint.test.ts`
Expected: PASS (new + existing lint tests green).

- [ ] **Step 5: Commit**

```bash
git add src/qa/lint.ts src/qa/lint-transition.test.ts
git commit -m "feat: QA determinism lint also covers transitionOut"
```

---

## Task 4: Orchestrator integration + v4 fixture

**Files:** Create `fixtures/sample-plan.v4.json`, `src/pipeline/build-plan-v4.test.ts`

**Interfaces:**
- No `build-plan.ts` code change needed (it already `validatePlanV3` + `runGate`). This task proves the transition path end-to-end and that the QA gate (incl. HyperFrames lint via render-check) passes with intentional different-track overlaps.

- [ ] **Step 1: Write the failing test**

Create `src/pipeline/build-plan-v4.test.ts`:

```ts
import { test, expect } from "bun:test";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildFromPlan } from "./build-plan";

const outDir = join(process.cwd(), "out/e2e-v4");

// Integration: needs say, ffmpeg, Node 22+ (HYPERFRAMES_NODE_BIN), Chrome. Slow (~1-2 min).
test("plan with authored transitions -> QA-passing narrated mp4 (video+audio)", async () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const mp4 = await buildFromPlan(join(process.cwd(), "fixtures/sample-plan.v4.json"), outDir);
  expect(existsSync(mp4)).toBe(true);
  const streams = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1", mp4]).toString();
  expect(streams).toContain("video");
  expect(streams).toContain("audio");
  const qa = JSON.parse(readFileSync(join(outDir, "qa-report.json"), "utf8"));
  expect(qa.ok).toBe(true); // render-check confirms overlaps are on DIFFERENT tracks (no same-track error)
}, 180000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/pipeline/build-plan-v4.test.ts`
Expected: FAIL — fixture missing.

- [ ] **Step 3: Write minimal implementation**

Create `fixtures/sample-plan.v4.json` (authored transitions; deterministic; on-palette):

```json
{
  "feature_name": "Feature to Enablement Video Pipeline",
  "value_prop": "At merge, auto-draft enablement so sales knows what shipped and how to position it.",
  "persona": "Sales enablement", "when_to_use": "When engineering out-ships sales' ability to keep up.",
  "talking_points": ["velocity outran enablement", "merge is max context"],
  "scenes": [
    { "id": "hook", "html": "<div class='anim' style='font-family:var(--uip-font-head);font-weight:700;font-size:88px;letter-spacing:-0.045em;color:var(--uip-white);line-height:1.05'>Shipping fast isn't the same as <span style='color:var(--uip-orange)'>selling fast.</span></div>",
      "motionScript": "tl.from(root.querySelector('.anim'),{autoAlpha:0,y:50,duration:0.7,ease:'power3.out'},start+0.2)",
      "transitionOut": "tl.to(root,{xPercent:-12,autoAlpha:0,duration:0.6,ease:'power2.inOut'},at)", "transitionOverlap": 0.6,
      "narration": "Engineering has never shipped faster. But shipping fast isn't the same as selling fast." },
    { "id": "fix", "html": "<div class='anim' style='font-family:var(--uip-font-head);font-weight:700;font-size:84px;letter-spacing:-0.04em;color:var(--uip-white)'>So we draft the enablement <span style='color:var(--uip-teal)'>at merge.</span></div>",
      "motionScript": "tl.from(root.querySelector('.anim'),{autoAlpha:0,x:80,duration:0.7,ease:'power3.out'},start+0.2)",
      "transitionOut": "tl.to(root,{scale:1.15,autoAlpha:0,duration:0.6,ease:'power2.in'},at)", "transitionOverlap": 0.6,
      "narration": "So right after deploy, the pipeline drafts the enablement — a video and a one-pager." },
    { "id": "cta", "component": "cta", "props": { "headline": "From merged to sellable. Automatically." }, "narration": "From merged to sellable, automatically." }
  ],
  "youtube_metadata": { "title": "Enablement Pipeline", "description": "d", "tags": ["uipath"], "chapters": [] }
}
```

- [ ] **Step 4: Run test to verify it passes**

Set env: `export HYPERFRAMES_NODE_BIN="$(dirname "$(nvm which stable)")"` (after `nvm use stable`).
Run: `bun test src/pipeline/build-plan-v4.test.ts`
Expected: PASS — `out/e2e-v4/renders/video.mp4` (video+audio) + `qa-report.json` `ok:true` (overlaps on different tracks → HyperFrames lint clean).

- [ ] **Step 5: Commit**

```bash
git add fixtures/sample-plan.v4.json src/pipeline/build-plan-v4.test.ts
git commit -m "test: e2e transitions fixture renders + passes QA (different-track overlaps)"
```

---

## Task 5: Director skill — transitions + quality bar

**Files:** Modify `.claude/skills/enablement-video/SKILL.md`; Test `src/scenes/skill-fixture-v4.test.ts`

**Interfaces:**
- Skill gains: transition authoring guidance (`transitionOut` + `transitionOverlap`, pairing an out with the next scene's in, keep 0.5–0.8s, determinism rules) and the detailed/top-notch quality bar (§3 of the spec). Test asserts `fixtures/sample-plan.v4.json` validates + passes non-render QA.

- [ ] **Step 1: Write the failing test**

Create `src/scenes/skill-fixture-v4.test.ts`:

```ts
import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { validatePlanV3 } from "../content-director/plan-schema";
import { runGate } from "../qa/gate";
import sample from "../../fixtures/sample-plan.v4.json";

test("transitions fixture validates and passes non-render QA", () => {
  const plan = validatePlanV3(sample);
  const r = runGate(plan as any, loadBrandTokens(), "out/none", { skipRenderCheck: true });
  expect(r.ok).toBe(true);
  expect(plan.scenes.some((s: any) => s.transitionOut)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/scenes/skill-fixture-v4.test.ts`
Expected: PASS immediately if the Task-4 fixture is clean (acceptable — still update SKILL.md in Step 3). If it fails, fix the fixture first.

- [ ] **Step 3: Update the skill**

In `.claude/skills/enablement-video/SKILL.md`, add two sections.

Add under the scene-authoring section:

```markdown
## Seam transitions (make it a film, not slides)
Give most scenes an authored exit so scenes flow into each other instead of hard-cutting:
- `transitionOut`: authored GSAP run as `(tl, root, at) => { … }` — animate THIS scene leaving,
  starting at `at` (its content-end). e.g. `tl.to(root,{xPercent:-12,autoAlpha:0,duration:0.6,ease:'power2.inOut'},at)`.
- `transitionOverlap`: seconds this scene lingers into the next (typical 0.5–0.8; 0/absent = hard cut).
- Pair it with the NEXT scene's entrance (its `motionScript`) so they cross: e.g. this scene pushes
  left out while the next pushes in from the right; or this fades/scales out while the next fades in.
- Vary transitions to fit the story; don't use the identical move on every seam.
- FORBIDDEN in `transitionOut` too (fails QA): Date.now, Math.random, new Date(, fetch(, XMLHttpRequest, import(.
```

Add near the creative mandate:

```markdown
## Quality bar — detailed and top-notch
- Every section must be FULLY DEVELOPED: a clear focal idea backed by concrete, specific content
  (real examples, specific phrasing) — never a bare headline.
- The video must be COMPREHENSIVE: problem → stakes → insight → mechanism → where it fits → payoff
  → trust model → CTA, each beat earning its place with authored motion and a seam transition.
- TOP-NOTCH production: considered hierarchy, purposeful explanatory motion, smooth transitions,
  on-brand type/color, generous spacing.
- Detailed ≠ cluttered: ONE clear focal point per scene, content within the caption safe-band
  (keep the bottom ~180px clear for captions), restrained accents. Rich, not busy.
- In self-review, reject thin/weak/cluttered/flat scenes and improve them before the human draft.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/scenes/skill-fixture-v4.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/enablement-video/SKILL.md src/scenes/skill-fixture-v4.test.ts
git commit -m "feat: director skill — seam transitions + detailed/top-notch quality bar"
```

---

## Self-Review

**Spec coverage:**
- §2/§4 free-form seam transitions (transitionOut+overlap, window overlap, alternating tracks, z-order, splice) → Tasks 1, 2 ✅
- §5 caption safe-band + scrim → Task 2 ✅
- §6 determinism lint covers transitionOut; track-overlap validated by HyperFrames lint via render-check (no new module) → Task 3 + Task 4 (qa.ok proves it) ✅
- §3 director quality bar → Task 5 ✅
- §8 testing (unit: schema, builder overlap/track/z/splice/caption; lint; integration: v4 fixture → QA-pass → mp4) → each task + Task 4 ✅
- Deferred per §10: element continuity across scenes; Playwright capture; SFX/music; one-pager/publish.

**Placeholder scan:** no TBD/TODO; complete code in each step; builder MODIFY shows exact added blocks with anchors.

**Type consistency:** `transitionOut`/`transitionOverlap` (Task 1) read by builder (Task 2) + lint (Task 3); `QAFinding`/`lintPlan` (existing) reused; `buildFromPlan`/`runGate` (existing) exercised by Task 4; fixture (Task 4) validated by Task 5. `data-track-index = i % 2`, `z-index = i`, and `data-duration = dur + overlap` are consistent between the builder and the Task 2 test assertions.

## Follow-on (not this milestone)
Element continuity across scenes (morph/carry an element between scenes); a codified self-review harness; Playwright demo capture; one-pager + publish.
```
