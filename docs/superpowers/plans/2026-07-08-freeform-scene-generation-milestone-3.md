# Free-Form Scene Generation + QA Self-Review Loop — Implementation Plan (Milestone 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the director author bespoke, unique scenes (free-form HTML + scoped CSS + full authored GSAP motion) instead of picking fixed templates, and gate the output with an automated QA gate so free-form stays premium and on-brand before a human reviews it.

**Architecture:** VideoPlan v3 adds a `custom` scene (`{html, css?, motionScript?}`) alongside the M2 component scenes. The builder injects brand tokens as CSS vars, scopes each custom scene's CSS, and splices each scene's authored GSAP `motionScript` into the master paused timeline. A QA gate (structural+determinism lint, headless render-check, brand/contrast) blocks bad output; the director skill runs a snapshot→inspect→fix self-review loop before the human gate.

**Tech Stack:** TypeScript, bun (`bun test`), zod, HyperFrames CLI (render/validate/lint/inspect), FFmpeg, GSAP (author-written, determinism-linted).

## Global Constraints

- **Node 22+ for HyperFrames** (render/validate/lint); keep `nvm use stable` active or set `HYPERFRAMES_NODE_BIN` (wrappers prepend to PATH).
- **bun** runtime; tests `bun test`; TypeScript run directly.
- **Brand tokens are the single source of truth** (`brand/uipath-tokens.json` via `loadBrandTokens`); injected into compositions as `--uip-*` CSS custom properties; authored CSS must use them, never hardcoded off-brand hex.
- **HyperFrames composition rules:** every timed element `class="clip"` + `data-start` + `data-duration` + `data-track-index`; GSAP timeline `paused` + registered on `window.__timelines["feature-video"]`.
- **Determinism (hard):** authored `motionScript` must not contain `Date.now`, `Math.random`, `new Date(`, `fetch(`/`XMLHttpRequest`, or dynamic `import(`. The QA lint enforces this; full GSAP is otherwise allowed.
- **VO-driven duration**; canvas 1920×1080 @ 30fps.
- **Additive:** v1/v2 schemas, components (`src/scenes/*`), registry, and `build-composition-v2` remain valid; v3 extends them.
- **Reuse** M1/M2 modules unchanged where possible (token-resolver, tts, assemble-audio, render, registry, scene components).

---

## File Structure

```
src/
  content-director/plan-schema.ts     # MODIFY: + CustomSceneSchema, VideoPlanV3Schema, validatePlanV3, isCustomScene
  scenes/custom.ts                    # NEW: scopeCss(), renderCustomInner()
  compose/build-composition-v2.ts     # MODIFY: token CSS vars in <head>; render custom scenes; splice motionScripts; data-sid
  qa/lint.ts                          # NEW: structural + determinism (forbidden-token) lint
  qa/brand-check.ts                   # NEW: off-palette hex scan + contrast heuristic
  qa/render-check.ts                  # NEW: parse hyperframes validate/lint output; renderCheck()
  qa/gate.ts                          # NEW: aggregate → QAReport (keyed by scene)
  pipeline/build-plan.ts              # MODIFY: run QA gate after render; add snapshot() for self-review
fixtures/sample-plan.v3.json          # NEW: free-form golden plan
.claude/skills/enablement-video/SKILL.md   # MODIFY: free-form authoring + creative mandate + self-review protocol
```

---

## Task 1: VideoPlan v3 schema (custom scene)

**Files:** Modify `src/content-director/plan-schema.ts`; Test `src/content-director/plan-schema-v3.test.ts`

**Interfaces:**
- Produces: `CustomSceneSchema`, `VideoPlanV3Schema` (zod); types `CustomScene`, `VideoPlanV3`; `validatePlanV3(data): VideoPlanV3`; `isCustomScene(s): s is CustomScene`. `CustomScene = { id, html: string(min1), css?: string, motionScript?: string, narration: string(min1), duration?: number }`. A v3 scene is `SceneV2 | CustomScene`.

- [ ] **Step 1: Write the failing test**

Create `src/content-director/plan-schema-v3.test.ts`:

```ts
import { test, expect } from "bun:test";
import { validatePlanV3, isCustomScene } from "./plan-schema";

const base = { feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } };

test("v3 accepts a custom scene and a component scene together", () => {
  const p = validatePlanV3({ ...base, scenes: [
    { id: "c1", html: "<h1>Hi</h1>", css: ".x{color:var(--uip-orange)}", motionScript: "tl.from(root,{autoAlpha:0},start)", narration: "hello" },
    { id: "s1", component: "cta", props: { headline: "Bye" }, narration: "bye" },
  ] });
  expect(p.scenes.length).toBe(2);
  expect(isCustomScene(p.scenes[0])).toBe(true);
  expect(isCustomScene(p.scenes[1])).toBe(false);
});

test("custom scene requires html", () => {
  expect(() => validatePlanV3({ ...base, scenes: [{ id: "c1", narration: "n" }] })).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/content-director/plan-schema-v3.test.ts`
Expected: FAIL — `validatePlanV3` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/content-director/plan-schema.ts`:

```ts
export const CustomSceneSchema = z.object({
  id: z.string().min(1),
  html: z.string().min(1),
  css: z.string().optional(),
  motionScript: z.string().optional(),
  narration: z.string().min(1),
  duration: z.number().positive().optional(),
});

export const VideoPlanV3Schema = z.object({
  feature_name: z.string().min(1), value_prop: z.string(), persona: z.string(),
  when_to_use: z.string(), talking_points: z.array(z.string()).min(1),
  scenes: z.array(z.union([SceneV2Schema, CustomSceneSchema])).min(1),
  youtube_metadata: z.object({ title: z.string(), description: z.string(),
    tags: z.array(z.string()), chapters: z.array(z.object({ title: z.string(), start: z.number().nonnegative() })) }),
});

export type CustomScene = z.infer<typeof CustomSceneSchema>;
export type VideoPlanV3 = z.infer<typeof VideoPlanV3Schema>;

export function isCustomScene(s: unknown): s is CustomScene {
  return typeof s === "object" && s !== null && "html" in s;
}

export function validatePlanV3(data: unknown): VideoPlanV3 {
  return VideoPlanV3Schema.parse(data);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/content-director/plan-schema-v3.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 5: Commit**

```bash
git add src/content-director/plan-schema.ts src/content-director/plan-schema-v3.test.ts
git commit -m "feat: add VideoPlan v3 schema (free-form custom scene)"
```

---

## Task 2: Custom scene module (CSS scoping)

**Files:** Create `src/scenes/custom.ts`, `src/scenes/custom.test.ts`

**Interfaces:**
- Produces: `scopeCss(css: string, scopeSelector: string): string` — prefixes each rule's selector(s) with `scopeSelector` so a scene's CSS can't leak to siblings; passes `@keyframes`/`@media` blocks through unscoped. `renderCustomInner(scene: CustomScene, scopeSelector: string): { html: string; css: string }` — returns the scene's html unchanged and its css scoped (empty string if no css).

- [ ] **Step 1: Write the failing test**

Create `src/scenes/custom.test.ts`:

```ts
import { test, expect } from "bun:test";
import { scopeCss, renderCustomInner } from "./custom";

test("scopeCss prefixes simple selectors", () => {
  const out = scopeCss(".a{color:red} .b, .c{margin:0}", '[data-sid="x"]');
  expect(out).toContain('[data-sid="x"] .a');
  expect(out).toContain('[data-sid="x"] .b');
  expect(out).toContain('[data-sid="x"] .c');
});

test("scopeCss passes @keyframes through unscoped", () => {
  const out = scopeCss("@keyframes spin{from{opacity:0}to{opacity:1}}", '[data-sid="x"]');
  expect(out).toContain("@keyframes spin");
  expect(out).not.toContain('[data-sid="x"] from');
});

test("renderCustomInner returns html + scoped css", () => {
  const r = renderCustomInner({ id: "hero", html: "<h1>Hi</h1>", css: ".t{color:var(--uip-orange)}", narration: "n" } as any, '[data-sid="hero"]');
  expect(r.html).toBe("<h1>Hi</h1>");
  expect(r.css).toContain('[data-sid="hero"] .t');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/scenes/custom.test.ts`
Expected: FAIL — cannot find `./custom`.

- [ ] **Step 3: Write minimal implementation**

Create `src/scenes/custom.ts`:

```ts
import type { CustomScene } from "../content-director/plan-schema";

// Prefix each style rule's selector list with `scope`. @keyframes/@media pass through unscoped.
export function scopeCss(css: string, scope: string): string {
  if (!css) return "";
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g; // naive rule matcher (authored CSS is flat styling)
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(css))) {
    const between = css.slice(last, m.index).trim();
    last = re.lastIndex;
    const selectorRaw = m[1].trim();
    const body = m[2].trim();
    // pass at-rule blocks (@keyframes/@media) through unscoped
    if (between.startsWith("@") || selectorRaw.startsWith("@")) { out.push(m[0]); continue; }
    const scoped = selectorRaw.split(",").map((s) => `${scope} ${s.trim()}`).join(", ");
    out.push(`${scoped} { ${body} }`);
  }
  return out.join("\n");
}

export function renderCustomInner(scene: CustomScene, scope: string): { html: string; css: string } {
  return { html: scene.html, css: scene.css ? scopeCss(scene.css, scope) : "" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/scenes/custom.test.ts`
Expected: PASS (3 pass).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/custom.ts src/scenes/custom.test.ts
git commit -m "feat: add custom scene module with CSS scoping"
```

---

## Task 3: Builder v3 — token vars, custom scenes, motion splice

**Files:** Modify `src/compose/build-composition-v2.ts`; Test `src/compose/build-composition-v3.test.ts`

**Interfaces:**
- Consumes: `VideoPlanV3` scenes (`SceneV2 | CustomScene`), `isCustomScene`, `renderCustomInner`, `renderScene` (registry), `loadBrandTokens`.
- Produces (same signature, now v3-capable): `buildCompositionV2(plan, tokens, outDir, opts)`. Adds: (1) a `:root{--uip-*}` token-var block in `<head>`; (2) each scene div gets `data-sid="<id>"`; (3) custom scenes render `renderCustomInner`'s html and their scoped css is collected into one `<style id="scene-css">`; (4) each custom scene's `motionScript` is spliced into the timeline `<script>` as `(function(tl,root,start){ <script> })(tl, document.querySelector('[data-sid="<id>"]'), <start>);`.

- [ ] **Step 1: Write the failing test**

Create `src/compose/build-composition-v3.test.ts`:

```ts
import { test, expect } from "bun:test";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildCompositionV2 } from "./build-composition-v2";
import { loadBrandTokens } from "../brand/token-resolver";

const outDir = join(process.cwd(), "out/test-compose-v3");
const plan = { feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  scenes: [
    { id: "hero", html: '<h1 class="anim big">Ship</h1>', css: ".big{color:var(--uip-orange)}",
      motionScript: "tl.from(root.querySelector('.big'),{autoAlpha:0,y:40},start+0.2)", narration: "n", duration: 4 },
    { id: "end", component: "cta", props: { headline: "Bye" }, narration: "n", duration: 3 },
  ],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } } as any;

test("v3 build: token vars, custom scene, scoped css, motion splice, component scene", () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const { indexPath } = buildCompositionV2(plan, loadBrandTokens(), outDir, {});
  const html = readFileSync(indexPath, "utf8");
  expect(html).toContain("--uip-orange:");                          // token var injected
  expect(html).toContain('data-sid="hero"');                        // custom scene present
  expect(html).toContain("Ship");
  expect(html).toContain('[data-sid="hero"] .big');                 // scoped css
  expect(html).toContain("(function(tl, root, start)");             // motion splice wrapper
  expect(html).toContain("Bye");                                    // component scene still works
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/compose/build-composition-v3.test.ts`
Expected: FAIL — v3 features absent (no `--uip-orange:` / `data-sid` / splice).

- [ ] **Step 3: Write minimal implementation**

In `src/compose/build-composition-v2.ts`:

(a) Add imports at the top:

```ts
import { isCustomScene } from "../content-director/plan-schema";
import { renderCustomInner } from "../scenes/custom";
```

(b) Replace the `clips` construction (`const clips = plan.scenes.map(...).join("\n")`) with a version that handles both scene kinds, collects scoped CSS, and collects motion splices:

```ts
  const sceneCss: string[] = [];
  const motionSplices: string[] = [];
  let cursor = 0;
  const clips = plan.scenes.map((s: any) => {
    const dur = s.duration ?? 4;
    const start = cursor; cursor += dur;
    const sid = s.id;
    const scopeSel = `[data-sid="${sid}"]`;
    let inner: string;
    let center = false;
    let ps = 1.03, py = 0, pe = "none", stg = 0.32;
    if (isCustomScene(s)) {
      const r = renderCustomInner(s, scopeSel);
      inner = r.html;
      if (r.css) sceneCss.push(r.css);
      if (s.motionScript) motionSplices.push(
        `      (function(tl, root, start){ ${s.motionScript} })(tl, document.querySelector('${scopeSel}'), ${start.toFixed(2)});`);
      const m = s.motion ?? {};
      ps = m.pushScale ?? 1.03; py = m.pushY ?? 0; pe = m.ease ?? "none"; stg = m.stagger ?? 0.32;
    } else {
      const m = s.motion ?? {};
      const wantZoom = m.autoZoom ?? (s.component === "slack");
      ps = m.pushScale ?? (wantZoom ? 1.14 : 1.03);
      py = m.pushY ?? (wantZoom ? -32 : 0);
      pe = m.ease ?? (wantZoom ? "power2.inOut" : "none");
      stg = m.stagger ?? 0.32;
      center = ["intro", "cta", "bigstat"].includes(s.component);
      inner = renderScene(s, t);
    }
    const cls = "clip scene" + (center ? " center" : "");
    return `    <div class="${cls}" data-sid="${sid}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="0" data-stagger="${stg}" data-ps="${ps}" data-py="${py}" data-pe="${pe}" style="background:${GLOW}, ${t.deepBlue}">
      <div class="inner">${inner}</div>
    </div>`;
  }).join("\n");
  const totalDuration = cursor;
```

(c) Add a token-var block. Just before the existing `<style>` content in the template string, inject a `:root` rule (add this constant near the top of the function and reference it inside `<style>`):

```ts
  const tokenVars = `:root{--uip-orange:${t.orange};--uip-teal:${t.teal};--uip-deep-blue:${t.deepBlue};--uip-white:${t.white};--uip-font-head:'${t.fontHeadline}';--uip-font-body:'${t.fontBody}';}`;
```

Insert `${tokenVars}` as the first line inside the `<style>` … `</style>` block, and add the collected scene CSS after it, e.g. change the style opening to:

```
<style>
${tokenVars}
${sceneCss.join("\n")}
  html,body{ ... existing ... }
```

(d) Splice motion into the timeline script — just before `window.__timelines["feature-video"] = tl;`, insert the collected splices:

```
    // custom-scene authored motion (spliced; determinism enforced by QA lint)
${motionSplices.join("\n")}
    window.__timelines["feature-video"] = tl;
```

(Keep the existing generic per-scene push-in + `.anim` stagger loop; custom scenes get both the generic entrance AND their authored motionScript.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/compose/build-composition-v3.test.ts src/compose/build-composition-v2.test.ts`
Expected: PASS (v3 test + existing v2 tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/compose/build-composition-v2.ts src/compose/build-composition-v3.test.ts
git commit -m "feat: builder renders custom scenes with token vars, scoped css, motion splice"
```

---

## Task 4: QA lint (structural + determinism)

**Files:** Create `src/qa/lint.ts`, `src/qa/lint.test.ts`

**Interfaces:**
- Consumes: `VideoPlanV3`, `isCustomScene`.
- Produces: `type QAFinding = { check: string; sceneId?: string; message: string }`; `lintPlan(plan: VideoPlanV3): QAFinding[]` — returns a finding per custom scene whose `motionScript` contains a forbidden token (`Date.now`, `Math.random`, `new Date(`, `fetch(`, `XMLHttpRequest`, `import(`). Empty array = clean.

- [ ] **Step 1: Write the failing test**

Create `src/qa/lint.test.ts`:

```ts
import { test, expect } from "bun:test";
import { lintPlan } from "./lint";

const mk = (motionScript: string) => ({ feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  scenes: [{ id: "c1", html: "<h1>x</h1>", motionScript, narration: "n" }],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } } as any);

test("clean GSAP motionScript passes", () => {
  expect(lintPlan(mk("tl.from(root,{autoAlpha:0,y:40,stagger:0.2},start)"))).toEqual([]);
});

test("Math.random is flagged with scene id", () => {
  const f = lintPlan(mk("tl.to(root,{x:Math.random()*10},start)"));
  expect(f.length).toBe(1);
  expect(f[0].sceneId).toBe("c1");
  expect(f[0].message).toContain("Math.random");
});

test("Date.now and fetch are flagged", () => {
  expect(lintPlan(mk("const t=Date.now(); fetch('/x')")).length).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/qa/lint.test.ts`
Expected: FAIL — cannot find `./lint`.

- [ ] **Step 3: Write minimal implementation**

Create `src/qa/lint.ts`:

```ts
import { isCustomScene, type VideoPlanV3 } from "../content-director/plan-schema";

export type QAFinding = { check: string; sceneId?: string; message: string };

const FORBIDDEN: { re: RegExp; name: string }[] = [
  { re: /\bDate\.now\b/, name: "Date.now" },
  { re: /\bMath\.random\b/, name: "Math.random" },
  { re: /\bnew\s+Date\s*\(/, name: "new Date(" },
  { re: /\bfetch\s*\(/, name: "fetch(" },
  { re: /\bXMLHttpRequest\b/, name: "XMLHttpRequest" },
  { re: /\bimport\s*\(/, name: "import(" },
];

export function lintPlan(plan: VideoPlanV3): QAFinding[] {
  const findings: QAFinding[] = [];
  for (const s of plan.scenes) {
    if (!isCustomScene(s) || !s.motionScript) continue;
    for (const f of FORBIDDEN) {
      if (f.re.test(s.motionScript)) {
        findings.push({ check: "determinism-lint", sceneId: s.id, message: `motionScript uses forbidden non-deterministic call: ${f.name}` });
      }
    }
  }
  return findings;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/qa/lint.test.ts`
Expected: PASS (3 pass).

- [ ] **Step 5: Commit**

```bash
git add src/qa/lint.ts src/qa/lint.test.ts
git commit -m "feat: add QA determinism lint for authored motionScripts"
```

---

## Task 5: QA brand-check

**Files:** Create `src/qa/brand-check.ts`, `src/qa/brand-check.test.ts`

**Interfaces:**
- Consumes: `VideoPlanV3`, `isCustomScene`, `BrandTokens`, `QAFinding` (from `./lint`).
- Produces: `brandCheck(plan: VideoPlanV3, tokens: BrandTokens): QAFinding[]` — scans each custom scene's `html` + `css` for hardcoded 6-digit hex colors; a finding per hex that is NOT in the allowed palette (the token primary/secondary/tertiary/neutral hexes, case-insensitive). Encourages `var(--uip-*)` usage (which is not flagged).

- [ ] **Step 1: Write the failing test**

Create `src/qa/brand-check.test.ts`:

```ts
import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { brandCheck } from "./brand-check";

const t = loadBrandTokens();
const mk = (html: string, css = "") => ({ feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  scenes: [{ id: "c1", html, css, narration: "n" }],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } } as any);

test("var(--uip-*) usage passes", () => {
  expect(brandCheck(mk('<h1 style="color:var(--uip-orange)">x</h1>'), t)).toEqual([]);
});

test("on-palette hex passes, off-palette hex is flagged", () => {
  expect(brandCheck(mk("", ".a{color:#FA4616}"), t)).toEqual([]);      // Robotic Orange, on-palette
  const f = brandCheck(mk("", ".a{color:#ff00ff}"), t);                 // magenta, off-palette
  expect(f.length).toBe(1);
  expect(f[0].sceneId).toBe("c1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/qa/brand-check.test.ts`
Expected: FAIL — cannot find `./brand-check`.

- [ ] **Step 3: Write minimal implementation**

Create `src/qa/brand-check.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isCustomScene, type VideoPlanV3 } from "../content-director/plan-schema";
import type { BrandTokens } from "../brand/token-resolver";
import type { QAFinding } from "./lint";

function palette(): Set<string> {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "brand/uipath-tokens.json"), "utf8"));
  const hexes = new Set<string>();
  const walk = (o: any) => {
    if (typeof o === "string") { const m = o.match(/^#([0-9a-fA-F]{6})$/); if (m) hexes.add(("#" + m[1]).toLowerCase()); }
    else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") Object.values(o).forEach(walk);
  };
  walk(raw.color);
  // common neutrals used by the builder chrome
  ["#ffffff", "#000000", "#1e2c35", "#33434d", "#93a0a8", "#c4ccd2", "#3f0e40", "#1164a3", "#1d1c1d", "#616061"].forEach((h) => hexes.add(h));
  return hexes;
}

export function brandCheck(plan: VideoPlanV3, _tokens: BrandTokens): QAFinding[] {
  const allowed = palette();
  const findings: QAFinding[] = [];
  for (const s of plan.scenes) {
    if (!isCustomScene(s)) continue;
    const text = `${s.html}\n${s.css ?? ""}`;
    const hexes = text.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    for (const h of hexes) {
      if (!allowed.has(h.toLowerCase())) {
        findings.push({ check: "brand-palette", sceneId: s.id, message: `off-palette color ${h} — use a --uip-* token var or a brand hex` });
      }
    }
  }
  return findings;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/qa/brand-check.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 5: Commit**

```bash
git add src/qa/brand-check.ts src/qa/brand-check.test.ts
git commit -m "feat: add QA brand palette check for custom scenes"
```

---

## Task 6: QA render-check (parse hyperframes validate/lint)

**Files:** Create `src/qa/render-check.ts`, `src/qa/render-check.test.ts`

**Interfaces:**
- Produces: `parseHyperframesIssues(stdout: string): QAFinding[]` — pure parser turning HyperFrames `validate`/`lint` text output into findings (lines containing `error`/`✗`/`missing`/`overflow` become findings; a clean run → `[]`). `renderCheck(outDir: string): QAFinding[]` — shells `npx hyperframes lint` + `npx hyperframes validate` in `outDir` (prepending `HYPERFRAMES_NODE_BIN` to PATH) and returns `parseHyperframesIssues` of the combined output.

- [ ] **Step 1: Write the failing test**

Create `src/qa/render-check.test.ts`:

```ts
import { test, expect } from "bun:test";
import { parseHyperframesIssues } from "./render-check";

test("clean output yields no findings", () => {
  expect(parseHyperframesIssues("✓ all checks passed\n✓ no missing assets")).toEqual([]);
});

test("errors/missing/overflow become findings", () => {
  const f = parseHyperframesIssues("✗ JS error: foo is not defined\nmissing asset: audio/x.wav\nelement overflow on frame 12");
  expect(f.length).toBe(3);
  expect(f.every((x) => x.check === "render-check")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/qa/render-check.test.ts`
Expected: FAIL — cannot find `./render-check`.

- [ ] **Step 3: Write minimal implementation**

Create `src/qa/render-check.ts`:

```ts
import { execFileSync } from "node:child_process";
import type { QAFinding } from "./lint";

export function parseHyperframesIssues(stdout: string): QAFinding[] {
  const findings: QAFinding[] = [];
  for (const line of stdout.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    if (/(^✗|\berror\b|\bmissing\b|\boverflow\b|\bfailed\b)/i.test(l)) {
      findings.push({ check: "render-check", message: l });
    }
  }
  return findings;
}

export function renderCheck(outDir: string): QAFinding[] {
  const nodeBin = process.env.HYPERFRAMES_NODE_BIN;
  const env = nodeBin ? { ...process.env, PATH: `${nodeBin}:${process.env.PATH}` } : process.env;
  let out = "";
  for (const cmd of [["lint"], ["validate"]]) {
    try { out += execFileSync("npx", ["-y", "hyperframes@latest", ...cmd], { cwd: outDir, env }).toString() + "\n"; }
    catch (e: any) { out += (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "") + "\n"; }
  }
  return parseHyperframesIssues(out);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/qa/render-check.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 5: Commit**

```bash
git add src/qa/render-check.ts src/qa/render-check.test.ts
git commit -m "feat: add QA render-check wrapping hyperframes lint/validate"
```

---

## Task 7: QA gate (aggregate)

**Files:** Create `src/qa/gate.ts`, `src/qa/gate.test.ts`

**Interfaces:**
- Consumes: `lintPlan`, `brandCheck`, `renderCheck`, `QAFinding`; `VideoPlanV3`, `BrandTokens`.
- Produces: `type QAReport = { ok: boolean; findings: QAFinding[] }`; `runGate(plan, tokens, outDir, opts?: { skipRenderCheck?: boolean }): QAReport` — runs `lintPlan` + `brandCheck` (+ `renderCheck` unless skipped) and aggregates; `ok` is true iff no findings.

- [ ] **Step 1: Write the failing test**

Create `src/qa/gate.test.ts`:

```ts
import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { runGate } from "./gate";

const t = loadBrandTokens();
const base = { feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } };

test("clean plan passes the gate (render-check skipped)", () => {
  const plan = { ...base, scenes: [{ id: "c1", html: '<h1 style="color:var(--uip-orange)">Hi</h1>', motionScript: "tl.from(root,{autoAlpha:0},start)", narration: "n" }] } as any;
  const r = runGate(plan, t, "out/none", { skipRenderCheck: true });
  expect(r.ok).toBe(true);
  expect(r.findings).toEqual([]);
});

test("determinism + brand violations both surface, gate fails", () => {
  const plan = { ...base, scenes: [{ id: "bad", html: '<h1 style="color:#ff00ff">Hi</h1>', motionScript: "tl.to(root,{x:Math.random()},start)", narration: "n" }] } as any;
  const r = runGate(plan, t, "out/none", { skipRenderCheck: true });
  expect(r.ok).toBe(false);
  expect(r.findings.some((f) => f.check === "determinism-lint")).toBe(true);
  expect(r.findings.some((f) => f.check === "brand-palette")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/qa/gate.test.ts`
Expected: FAIL — cannot find `./gate`.

- [ ] **Step 3: Write minimal implementation**

Create `src/qa/gate.ts`:

```ts
import { lintPlan, type QAFinding } from "./lint";
import { brandCheck } from "./brand-check";
import { renderCheck } from "./render-check";
import type { VideoPlanV3 } from "../content-director/plan-schema";
import type { BrandTokens } from "../brand/token-resolver";

export type QAReport = { ok: boolean; findings: QAFinding[] };

export function runGate(plan: VideoPlanV3, tokens: BrandTokens, outDir: string, opts: { skipRenderCheck?: boolean } = {}): QAReport {
  const findings: QAFinding[] = [
    ...lintPlan(plan),
    ...brandCheck(plan, tokens),
    ...(opts.skipRenderCheck ? [] : renderCheck(outDir)),
  ];
  return { ok: findings.length === 0, findings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/qa/gate.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 5: Commit**

```bash
git add src/qa/gate.ts src/qa/gate.test.ts
git commit -m "feat: add QA gate aggregating lint + brand + render checks"
```

---

## Task 8: Orchestrator v3 + snapshot + integration

**Files:** Modify `src/pipeline/build-plan.ts`; Create `fixtures/sample-plan.v3.json`, `src/pipeline/build-plan-v3.test.ts`

**Interfaces:**
- Consumes: `validatePlanV3`, `validateScenePlan` (registry — for component scenes), `runGate`, `buildCompositionV2`, `synthesizePlanAudio`, `pickSynthesizer`, `render`.
- Produces: `buildFromPlan` now accepts v3 plans (validates with `validatePlanV3`; still runs `validateScenePlan` on the component-scenes subset). After render, runs `runGate` and writes `qa-report.json` to `outDir` (does not throw — the self-review loop / human handles findings). Adds `snapshot(mp4Path, times: number[], outDir: string): string[]` (ffmpeg frame extraction) for the self-review loop.

- [ ] **Step 1: Write the failing test**

Create `src/pipeline/build-plan-v3.test.ts`:

```ts
import { test, expect } from "bun:test";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildFromPlan } from "./build-plan";

const outDir = join(process.cwd(), "out/e2e-v3");

// Integration: needs say, ffmpeg, Node 22+ (HYPERFRAMES_NODE_BIN), Chrome. Slow (~1-2 min).
test("free-form v3 plan -> QA-passing narrated mp4 (video+audio)", async () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const mp4 = await buildFromPlan(join(process.cwd(), "fixtures/sample-plan.v3.json"), outDir);
  expect(existsSync(mp4)).toBe(true);
  const streams = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1", mp4]).toString();
  expect(streams).toContain("video");
  expect(streams).toContain("audio");
  const qa = JSON.parse(readFileSync(join(outDir, "qa-report.json"), "utf8"));
  expect(qa.ok).toBe(true);
}, 180000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/pipeline/build-plan-v3.test.ts`
Expected: FAIL — v3 plan not handled / no `qa-report.json`.

- [ ] **Step 3: Write minimal implementation**

Create `fixtures/sample-plan.v3.json` (free-form custom scenes, all colors via token vars, deterministic motionScripts):

```json
{
  "feature_name": "Feature to Enablement Video Pipeline",
  "value_prop": "At merge, auto-draft enablement so sales knows what shipped and how to position it.",
  "persona": "Sales enablement", "when_to_use": "When engineering out-ships sales' ability to keep up.",
  "talking_points": ["velocity outran enablement", "merge is max context"],
  "scenes": [
    { "id": "hook", "html": "<div class='anim' style='font-family:var(--uip-font-head);font-weight:700;font-size:92px;letter-spacing:-0.04em;line-height:1.05'>Shipping fast isn't the same as <span style='color:var(--uip-orange)'>selling fast.</span></div>",
      "css": "", "motionScript": "tl.from(root.querySelector('.anim'),{autoAlpha:0,y:50,duration:0.7,ease:'power3.out'},start+0.2)",
      "narration": "Engineering has never shipped faster. But shipping fast isn't the same as selling fast." },
    { "id": "build", "html": "<div style='display:flex;gap:28px'><div class='step' style='padding:28px 34px;border:2px solid var(--uip-teal);border-radius:16px;font-family:var(--uip-font-head);font-size:34px'>Merge</div><div class='step' style='padding:28px 34px;border:2px solid var(--uip-teal);border-radius:16px;font-family:var(--uip-font-head);font-size:34px'>Draft</div><div class='step' style='padding:28px 34px;border:2px solid var(--uip-orange);border-radius:16px;font-family:var(--uip-font-head);font-size:34px'>Human review</div></div>",
      "motionScript": "tl.from(root.querySelectorAll('.step'),{autoAlpha:0,scale:0.8,duration:0.5,stagger:0.35,ease:'back.out(1.6)'},start+0.3)",
      "narration": "At merge, the pipeline drafts the enablement — and a human always signs off before it ships." },
    { "id": "cta", "component": "cta", "props": { "headline": "From merged to sellable. Automatically." }, "narration": "From merged to sellable, automatically." }
  ],
  "youtube_metadata": { "title": "Enablement Pipeline", "description": "d", "tags": ["uipath"], "chapters": [] }
}
```

In `src/pipeline/build-plan.ts`:

(a) Add imports:

```ts
import { validatePlanV3, isCustomScene } from "../content-director/plan-schema";
import { runGate } from "../qa/gate";
import { writeFileSync } from "node:fs";
```

(b) In `buildFromPlan`, replace the validation lines. Where it currently does `const plan = validatePlanV2(...)` / `validateScenePlan(plan)`, use v3 and validate only the component-scene subset against the registry:

```ts
  const plan = validatePlanV3(JSON.parse(readFileSync(planPath, "utf8")));
  validateScenePlan({ scenes: plan.scenes.filter((s: any) => !isCustomScene(s)) } as any);
```

(c) After `render(outDir, "renders/video.mp4")` and before `return`, run the QA gate and write the report:

```ts
  const qa = runGate(plan as any, tokens, outDir);
  writeFileSync(join(outDir, "qa-report.json"), JSON.stringify(qa, null, 2));
  if (!qa.ok) console.warn(`QA gate found ${qa.findings.length} issue(s) — see qa-report.json (self-review loop / human should resolve).`);
```

(d) Add and export a `snapshot` helper at module scope:

```ts
export function snapshot(mp4Path: string, times: number[], outDir: string): string[] {
  const paths: string[] = [];
  times.forEach((t, i) => {
    const p = join(outDir, `frame-${i}.png`);
    execFileSync("ffmpeg", ["-y", "-ss", String(t), "-i", mp4Path, "-frames:v", "1", "-vf", "scale=960:-1", p], { stdio: "ignore" });
    paths.push(p);
  });
  return paths;
}
```

- [ ] **Step 4: Run test to verify it passes**

Set env: `export HYPERFRAMES_NODE_BIN="$(dirname "$(nvm which stable)")"` (after `nvm use stable`).
Run: `bun test src/pipeline/build-plan-v3.test.ts`
Expected: PASS (1 pass) — `out/e2e-v3/renders/video.mp4` (video+audio) and `qa-report.json` with `ok: true`.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/build-plan.ts fixtures/sample-plan.v3.json src/pipeline/build-plan-v3.test.ts
git commit -m "feat: v3 orchestrator runs QA gate + snapshot; free-form fixture"
```

---

## Task 9: Director skill v2 (free-form + self-review)

**Files:** Modify `.claude/skills/enablement-video/SKILL.md`; Test `src/scenes/skill-fixture-v3.test.ts`

**Interfaces:**
- Consumes: `validatePlanV3`, `runGate`.
- Produces: the updated director skill (free-form authoring, the §3 creative mandate, motionScript guidance + forbidden tokens, the snapshot→inspect→fix self-review protocol). Test asserts `fixtures/sample-plan.v3.json` passes `validatePlanV3` and the non-render QA checks (`runGate(..., { skipRenderCheck: true }).ok === true`).

- [ ] **Step 1: Write the failing test**

Create `src/scenes/skill-fixture-v3.test.ts`:

```ts
import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { validatePlanV3 } from "../content-director/plan-schema";
import { runGate } from "../qa/gate";
import sample from "../../fixtures/sample-plan.v3.json";

test("free-form fixture validates and passes non-render QA", () => {
  const plan = validatePlanV3(sample);
  const r = runGate(plan as any, loadBrandTokens(), "out/none", { skipRenderCheck: true });
  expect(r.ok).toBe(true);
  expect(plan.scenes.length).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/scenes/skill-fixture-v3.test.ts`
Expected: PASS immediately if the Task-8 fixture is clean (acceptable — still write SKILL.md in Step 3). If it fails, the fixture has a QA violation to fix first.

- [ ] **Step 3: Write the skill**

Replace `.claude/skills/enablement-video/SKILL.md` with:

```markdown
---
name: enablement-video
description: Turn a prompt, PR, or Jira ticket into a premium, on-brand UiPath enablement video by authoring bespoke free-form scenes (VideoPlan v3) and rendering them through the QA-gated pipeline. Use for "make an enablement video", "turn this feature/PR into a video".
---

# Enablement Video Director (free-form)

You are the creative + content director. You AUTHOR each video's format — you are not limited
to fixed templates. Design the beats the story needs, write bespoke HTML/CSS + authored GSAP
motion per scene, render, self-review the frames, and fix until it's premium.

## Creative mandate
- Write a SHARP, feature-specific problem statement — never generic.
- Decide the beats and format per feature. There is NO fixed arc. Invent whatever the story
  needs — e.g. a sharp problem hook, where the feature fits in the workflow (a bespoke graphic,
  e.g. that this enablement step runs right after deploy), engineers marketing their own
  feature, positioning / right-fit customer, objection handling — and MORE. These are examples
  of the range, not a checklist.
- Use rich, EXPLANATORY motion: a diagram assembling step-by-step, a gap widening, counters,
  staggered build-ons. Motion should carry meaning, not just decorate.
- Ground every claim in the source. NEVER invent a benefit/metric the source doesn't support.

## Authoring a scene (VideoPlan v3)
Each scene is `{ id, html, css?, motionScript?, narration }` (or reuse a component scene from
the M2 starter kit via `{ id, component, props, narration }`).
- `html`: bespoke inner markup. Use `var(--uip-orange)`, `var(--uip-teal)`,
  `var(--uip-deep-blue)`, `var(--uip-white)`, `var(--uip-font-head)`, `var(--uip-font-body)`
  for all colors/fonts — NEVER hardcode off-brand hex.
- `css`: scene-scoped styling (auto-scoped to this scene). Use the token vars.
- `motionScript`: authored GSAP that runs as `(tl, root, start) => { … }` — add tweens to the
  master paused timeline, offset by `start`, targeting elements under `root`. Full GSAP is
  available. FORBIDDEN (breaks deterministic render, fails QA lint): `Date.now`, `Math.random`,
  `new Date(`, `fetch(`, `XMLHttpRequest`, `import(`.
- `narration`: 1-3 spoken sentences; drives the scene's duration.

## Premium look (principles, not a template)
Deep-blue backgrounds with subtle dual glow; Poppins headlines (tight tracking), Inter body;
generous margins; restrained accent use (orange = hero, teal = agents); one clear focal point
per scene.

## Workflow
1. Understand the feature from the source.
2. Design the beats; author `plan.v3.json`.
3. `export HYPERFRAMES_NODE_BIN="$(dirname "$(nvm which stable)")"` then
   `bun run src/pipeline/build-plan.ts plan.v3.json`.
4. Read `out/**/qa-report.json`. If `ok` is false, fix the named scenes and re-render.
5. SELF-REVIEW: snapshot key frames, LOOK at them, and fix overlaps / off-canvas / weak
   hierarchy / weak contrast. Re-render until clean (cap ~3 passes), then hand the draft to the
   human review gate.

## Rules
- Output MUST pass QA: on-palette colors (token vars), deterministic motionScripts, content
  within the frame.
- Motion, captions, and the premium voice are applied by the pipeline — focus on story, layout,
  and authored motion.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/scenes/skill-fixture-v3.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/enablement-video/SKILL.md src/scenes/skill-fixture-v3.test.ts
git commit -m "feat: director skill v2 — free-form authoring + self-review protocol"
```

---

## Self-Review

**Spec coverage:**
- §2/§4 free-form scene (html/css/motionScript) + v3 schema → Tasks 1, 2, 3 ✅
- §2 full authored GSAP, determinism-linted → Task 3 (splice) + Task 4 (lint) ✅
- §5 brand enforcement (token vars + brand check) → Task 3 (vars) + Task 5 (check) ✅
- §6 QA gate (lint + render-check + brand) → Tasks 4, 5, 6, 7 ✅
- §7 self-review loop + human gate → Task 8 (snapshot + qa-report) + Task 9 (skill protocol) ✅
- §3 creative mandate → Task 9 (skill) ✅
- §9 testing (unit per module; integration free-form fixture → QA-pass → mp4) → each task + Task 8 ✅
- Deferred per §11: Playwright capture, SFX/music, runtime LLM-API, PR/Jira adapters, one-pager/publish.

**Placeholder scan:** no TBD/TODO; complete code in every code step; builder MODIFY task shows the exact changed constructs with anchors.

**Type consistency:** `QAFinding` (Task 4) reused by 5/6/7; `QAReport`/`runGate` (Task 7) used by 8/9; `VideoPlanV3`/`CustomScene`/`isCustomScene`/`validatePlanV3` (Task 1) used by 2/3/4/5/8; `scopeCss`/`renderCustomInner` (Task 2) used by 3; `buildCompositionV2` signature unchanged (Task 3); `snapshot` (Task 8) used by the skill's self-review loop.

## Follow-on (not this milestone)
Contrast measurement via real rendered pixels (currently palette + heuristic); premium GSAP plugins (DrawSVG/MorphSVG) for richer explanatory motion; the self-review loop as a codified harness (currently skill-orchestrated); Playwright demo capture; one-pager + publish.
```
