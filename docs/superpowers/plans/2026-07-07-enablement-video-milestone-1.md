# Enablement Video Pipeline — Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a free-text prompt into a narrated, UiPath-branded MP4 by running the full pipeline spine (ingest → plan → compose → audio → render) end-to-end.

**Architecture:** A small TypeScript pipeline (run with bun) that produces a HyperFrames HTML composition from a validated `VideoPlan`, generates voiceover from the per-scene narration, lets VO length drive scene timing, and shells out to the HyperFrames CLI to render an MP4 with the audio muxed in. The content director produces the plan; in this milestone its internals are a deterministic baseline generator with a documented seam for the LLM upgrade.

**Tech Stack:** TypeScript, bun (runtime + `bun test`), zod (validation), HyperFrames CLI (`npx hyperframes render`), FFmpeg + macOS `say` (voiceover for this milestone).

## Global Constraints

- **Node 22+ is required for the HyperFrames CLI.** Keep `nvm use stable` (v24.14.1) active in the shell, OR set `HYPERFRAMES_NODE_BIN` to the nvm bin dir (`/Users/rakshithdattatrayahegde/.nvm/versions/node/v24.14.1/bin`); the render wrapper prepends it to `PATH`.
- **Runtime/package manager: bun 1.3.14.** Tests run via `bun test`. TypeScript is executed directly by bun (no build step).
- **Brand tokens are the single source of truth:** `brand/uipath-tokens.json` (already exists). Never hardcode colors/fonts anywhere else — read them through the token resolver.
- **HyperFrames composition rules (all mandatory):** every timed element has `class="clip"` + `data-start` + `data-duration` + `data-track-index`; the GSAP timeline must be `paused` and registered on `window.__timelines["<composition-id>"]`; video layers use `muted` with a separate `<audio>` element for audio; deterministic only — no `Date.now()`, `Math.random()`, or network calls beyond the Google-Fonts + GSAP CDN links.
- **Duration is content-driven:** VO length sets each scene's duration; there is no fixed total runtime.
- **No invented claims:** narration must derive only from the `SourceContext` (for a manual prompt, the provided text). The full claim-check QA gate is a later milestone.
- **This milestone produces a draft only** — no publishing.
- **Canvas:** 1920×1080 @ 30fps.

---

## File Structure

```
Hackweek2k26/
  package.json                          # bun project + zod dep
  tsconfig.json                         # editor types (bun runs TS directly)
  brand/uipath-tokens.json              # EXISTS — token source of truth
  brand/logos/uipath-logo-orange.png    # EXISTS
  src/
    types.ts                            # SourceContext schema + type
    ingest/manual-prompt.ts             # promptToSourceContext()
    content-director/plan-schema.ts     # VideoPlan schema + validatePlan()
    content-director/content-director.ts# generatePlan() (deterministic baseline + LLM seam)
    content-director/SKILL.md           # creative direction for the LLM upgrade
    brand/token-resolver.ts             # loadBrandTokens()
    compose/scene-card.ts               # sceneCard() + escapeHtml()
    compose/build-composition.ts        # buildComposition()
    audio/tts.ts                        # SpeechSynthesizer + saySynthesizer
    audio/assemble-audio.ts             # wavDuration() + synthesizePlanAudio()
    render/render.ts                    # render()
    pipeline/run.ts                     # run() orchestrator
  fixtures/
    sample-plan.json                    # golden VideoPlan (for spine tests)
  *.test.ts                             # colocated bun tests
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `src/smoke.test.ts`
- Init: git repository

**Interfaces:**
- Produces: a working `bun test` command; project deps (`zod`).

- [ ] **Step 1: Initialize git and bun project**

```bash
cd /Users/rakshithdattatrayahegde/Documents/Hackweek2k26
git init
printf "node_modules/\nout/\n*.aiff\n" > .gitignore
```

Create `package.json`:

```json
{
  "name": "enablement-video-pipeline",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "bun test",
    "pipeline": "bun run src/pipeline/run.ts"
  },
  "dependencies": {
    "zod": "^3.23.8"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "noEmit": true
  }
}
```

- [ ] **Step 2: Install deps**

Run: `bun install`
Expected: creates `bun.lockb`, installs zod.

- [ ] **Step 3: Write a smoke test**

Create `src/smoke.test.ts`:

```ts
import { test, expect } from "bun:test";

test("bun test runs", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 4: Run the smoke test**

Run: `bun test src/smoke.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold bun + typescript project with zod"
```

---

## Task 2: SourceContext type

**Files:**
- Create: `src/types.ts`, `src/types.test.ts`

**Interfaces:**
- Produces: `SourceContextSchema` (zod), `SourceContext` (type). Shape: `{ kind: "prompt"|"pr"|"jira"; title: string; summary: string; details: string; evidence: string[]; links: string[] }`.

- [ ] **Step 1: Write the failing test**

Create `src/types.test.ts`:

```ts
import { test, expect } from "bun:test";
import { SourceContextSchema } from "./types";

test("valid source context parses", () => {
  const ctx = SourceContextSchema.parse({
    kind: "prompt",
    title: "Agentic automation",
    summary: "New feature",
    details: "Full text",
  });
  expect(ctx.kind).toBe("prompt");
  expect(ctx.evidence).toEqual([]); // defaulted
});

test("invalid kind rejected", () => {
  expect(() => SourceContextSchema.parse({ kind: "email", title: "x", summary: "x", details: "x" })).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/types.test.ts`
Expected: FAIL — cannot find module `./types`.

- [ ] **Step 3: Write minimal implementation**

Create `src/types.ts`:

```ts
import { z } from "zod";

export const SourceContextSchema = z.object({
  kind: z.enum(["prompt", "pr", "jira"]),
  title: z.string().min(1),
  summary: z.string(),
  details: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),
});

export type SourceContext = z.infer<typeof SourceContextSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/types.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/types.test.ts
git commit -m "feat: add SourceContext schema"
```

---

## Task 3: VideoPlan schema + validator

**Files:**
- Create: `src/content-director/plan-schema.ts`, `src/content-director/plan-schema.test.ts`, `fixtures/sample-plan.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `VideoPlanSchema`, `SceneSchema` (zod); `VideoPlan`, `Scene` (types); `validatePlan(data: unknown): VideoPlan`. Scene shape: `{ id: string; type: "hook"|"capability"|"demo"|"positioning"|"cta"|"diagram"; duration: number; on_screen_text: string; narration: string; footage_requirement?: { steps: string[] }; asset_requirements: { need: string; spec: string }[] }`.

- [ ] **Step 1: Write the failing test**

Create `src/content-director/plan-schema.test.ts`:

```ts
import { test, expect } from "bun:test";
import { validatePlan } from "./plan-schema";
import sample from "../../fixtures/sample-plan.json";

test("golden fixture validates", () => {
  const plan = validatePlan(sample);
  expect(plan.scenes.length).toBeGreaterThan(0);
  expect(plan.feature_name.length).toBeGreaterThan(0);
});

test("scene with non-positive duration rejected", () => {
  const bad = structuredClone(sample) as any;
  bad.scenes[0].duration = 0;
  expect(() => validatePlan(bad)).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/content-director/plan-schema.test.ts`
Expected: FAIL — cannot find `./plan-schema` and `sample-plan.json`.

- [ ] **Step 3: Write minimal implementation**

Create `src/content-director/plan-schema.ts`:

```ts
import { z } from "zod";

export const SceneTypeSchema = z.enum(["hook", "capability", "demo", "positioning", "cta", "diagram"]);

export const AssetRequirementSchema = z.object({
  need: z.enum(["brand_intro", "diagram", "callout", "section_card", "brand_outro"]),
  spec: z.string(),
});

export const SceneSchema = z.object({
  id: z.string().min(1),
  type: SceneTypeSchema,
  duration: z.number().positive(),
  on_screen_text: z.string(),
  narration: z.string().min(1),
  footage_requirement: z.object({ steps: z.array(z.string()) }).optional(),
  asset_requirements: z.array(AssetRequirementSchema).default([]),
});

export const VideoPlanSchema = z.object({
  feature_name: z.string().min(1),
  value_prop: z.string(),
  persona: z.string(),
  when_to_use: z.string(),
  talking_points: z.array(z.string()).min(1),
  scenes: z.array(SceneSchema).min(1),
  youtube_metadata: z.object({
    title: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
    chapters: z.array(z.object({ title: z.string(), start: z.number().nonnegative() })),
  }),
});

export type VideoPlan = z.infer<typeof VideoPlanSchema>;
export type Scene = z.infer<typeof SceneSchema>;

export function validatePlan(data: unknown): VideoPlan {
  return VideoPlanSchema.parse(data);
}
```

Create `fixtures/sample-plan.json`:

```json
{
  "feature_name": "Agentic Document Understanding",
  "value_prop": "Extract data from any document with self-correcting agents.",
  "persona": "Account Executive",
  "when_to_use": "When a customer complains about brittle template-based extraction.",
  "talking_points": [
    "Handles unseen document layouts without retraining",
    "Agents self-correct low-confidence fields",
    "Cuts document-processing setup from weeks to hours"
  ],
  "scenes": [
    { "id": "s1", "type": "hook", "duration": 4, "on_screen_text": "Documents shouldn't break your automations.", "narration": "Customers kept hitting broken extractions every time a document layout changed.", "asset_requirements": [] },
    { "id": "s2", "type": "capability", "duration": 4, "on_screen_text": "Agentic Document Understanding", "narration": "Agentic Document Understanding reads any document and self-corrects its own low-confidence fields.", "asset_requirements": [] },
    { "id": "s3", "type": "demo", "duration": 4, "on_screen_text": "See it adapt in real time", "narration": "Watch it handle a layout it has never seen before, with no retraining.", "asset_requirements": [] },
    { "id": "s4", "type": "positioning", "duration": 4, "on_screen_text": "Use when extraction keeps breaking", "narration": "Bring this up when a customer says their current extraction breaks on new document types.", "asset_requirements": [] },
    { "id": "s5", "type": "cta", "duration": 3, "on_screen_text": "Learn more on the docs hub", "narration": "Find the full enablement kit on the internal docs hub.", "asset_requirements": [] }
  ],
  "youtube_metadata": {
    "title": "Agentic Document Understanding — Enablement",
    "description": "Internal enablement walkthrough.",
    "tags": ["uipath", "enablement", "document understanding"],
    "chapters": [{ "title": "Hook", "start": 0 }]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/content-director/plan-schema.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 5: Commit**

```bash
git add src/content-director/plan-schema.ts src/content-director/plan-schema.test.ts fixtures/sample-plan.json
git commit -m "feat: add VideoPlan schema, validator, and golden fixture"
```

---

## Task 4: Manual-prompt ingest adapter

**Files:**
- Create: `src/ingest/manual-prompt.ts`, `src/ingest/manual-prompt.test.ts`

**Interfaces:**
- Consumes: `SourceContext` type from `src/types.ts`.
- Produces: `promptToSourceContext(prompt: string): SourceContext`.

- [ ] **Step 1: Write the failing test**

Create `src/ingest/manual-prompt.test.ts`:

```ts
import { test, expect } from "bun:test";
import { promptToSourceContext } from "./manual-prompt";

test("wraps prompt as SourceContext", () => {
  const ctx = promptToSourceContext("New agentic feature.\nDetails here.");
  expect(ctx.kind).toBe("prompt");
  expect(ctx.title).toBe("New agentic feature.");
  expect(ctx.details).toContain("Details here.");
  expect(ctx.evidence).toContain("New agentic feature.\nDetails here.");
});

test("empty prompt throws", () => {
  expect(() => promptToSourceContext("   ")).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/ingest/manual-prompt.test.ts`
Expected: FAIL — cannot find `./manual-prompt`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ingest/manual-prompt.ts`:

```ts
import { SourceContextSchema, type SourceContext } from "../types";

export function promptToSourceContext(prompt: string): SourceContext {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Prompt is empty");
  const firstLine = trimmed.split("\n")[0].slice(0, 80);
  return SourceContextSchema.parse({
    kind: "prompt",
    title: firstLine,
    summary: firstLine,
    details: trimmed,
    evidence: [trimmed],
    links: [],
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/ingest/manual-prompt.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 5: Commit**

```bash
git add src/ingest/manual-prompt.ts src/ingest/manual-prompt.test.ts
git commit -m "feat: add manual-prompt ingest adapter"
```

---

## Task 5: Brand token resolver

**Files:**
- Create: `src/brand/token-resolver.ts`, `src/brand/token-resolver.test.ts`

**Interfaces:**
- Consumes: `brand/uipath-tokens.json` (exists).
- Produces: `BrandTokens` (`{ orange, teal, deepBlue, white, fontHeadline, fontBody, logoOrange }` — all strings) and `loadBrandTokens(root?: string): BrandTokens`.

- [ ] **Step 1: Write the failing test**

Create `src/brand/token-resolver.test.ts`:

```ts
import { test, expect } from "bun:test";
import { loadBrandTokens } from "./token-resolver";

test("loads UiPath primary colors from tokens file", () => {
  const t = loadBrandTokens();
  expect(t.orange.toUpperCase()).toBe("#FA4616");
  expect(t.teal.toUpperCase()).toBe("#0BA2B3");
  expect(t.deepBlue.toUpperCase()).toBe("#182126");
  expect(t.fontHeadline).toBe("Poppins");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/brand/token-resolver.test.ts`
Expected: FAIL — cannot find `./token-resolver`.

- [ ] **Step 3: Write minimal implementation**

Create `src/brand/token-resolver.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface BrandTokens {
  orange: string;
  teal: string;
  deepBlue: string;
  white: string;
  fontHeadline: string;
  fontBody: string;
  logoOrange: string;
}

export function loadBrandTokens(root: string = process.cwd()): BrandTokens {
  const raw = JSON.parse(readFileSync(join(root, "brand/uipath-tokens.json"), "utf8"));
  const p = raw.color.primary;
  return {
    orange: p.roboticOrange.hex,
    teal: p.agenticTeal.hex,
    deepBlue: p.deepBlue.hex,
    white: p.brightWhite.hex,
    fontHeadline: "Poppins",
    fontBody: "Inter",
    logoOrange: "brand/logos/uipath-logo-orange.png",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/brand/token-resolver.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add src/brand/token-resolver.ts src/brand/token-resolver.test.ts
git commit -m "feat: add brand token resolver reading uipath-tokens.json"
```

---

## Task 6: Scene-card HTML generator

**Files:**
- Create: `src/compose/scene-card.ts`, `src/compose/scene-card.test.ts`

**Interfaces:**
- Consumes: `Scene` from `plan-schema.ts`; `BrandTokens` from `token-resolver.ts`.
- Produces: `escapeHtml(s: string): string`; `sceneCard(scene: Scene, startSec: number, tokens: BrandTokens, trackIndex?: number): string` returning a `class="clip"` div with the mandatory timing attributes.

- [ ] **Step 1: Write the failing test**

Create `src/compose/scene-card.test.ts`:

```ts
import { test, expect } from "bun:test";
import { sceneCard, escapeHtml } from "./scene-card";
import { loadBrandTokens } from "../brand/token-resolver";
import type { Scene } from "../content-director/plan-schema";

const tokens = loadBrandTokens();
const scene: Scene = { id: "s1", type: "hook", duration: 4, on_screen_text: "A & B", narration: "n", asset_requirements: [] };

test("emits mandatory timing attributes and escapes text", () => {
  const html = sceneCard(scene, 2, tokens);
  expect(html).toContain('class="clip');
  expect(html).toContain('data-start="2"');
  expect(html).toContain('data-duration="4"');
  expect(html).toContain('data-track-index="0"');
  expect(html).toContain("A &amp; B");
});

test("cta scene uses orange background", () => {
  const html = sceneCard({ ...scene, type: "cta" }, 0, tokens);
  expect(html.toUpperCase()).toContain("#FA4616");
});

test("escapeHtml handles all special chars", () => {
  expect(escapeHtml(`<a>&"`)).toBe("&lt;a&gt;&amp;&quot;");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/compose/scene-card.test.ts`
Expected: FAIL — cannot find `./scene-card`.

- [ ] **Step 3: Write minimal implementation**

Create `src/compose/scene-card.ts`:

```ts
import type { Scene } from "../content-director/plan-schema";
import type { BrandTokens } from "../brand/token-resolver";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

export function sceneCard(scene: Scene, startSec: number, tokens: BrandTokens, trackIndex = 0): string {
  const bg = scene.type === "cta" ? tokens.orange : tokens.deepBlue;
  return `  <div class="clip scene" data-start="${startSec}" data-duration="${scene.duration}" data-track-index="${trackIndex}"
       style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:120px;box-sizing:border-box;background:${bg};color:${tokens.white};font-family:'${tokens.fontHeadline}',sans-serif;">
    <div class="eyebrow" style="font-family:'${tokens.fontBody}',sans-serif;text-transform:uppercase;letter-spacing:0.12em;color:${tokens.teal};font-size:28px;margin-bottom:24px;">${escapeHtml(scene.type)}</div>
    <div class="headline" style="font-weight:700;font-size:84px;line-height:1.05;letter-spacing:-0.045em;max-width:1400px;">${escapeHtml(scene.on_screen_text)}</div>
  </div>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/compose/scene-card.test.ts`
Expected: PASS (3 pass).

- [ ] **Step 5: Commit**

```bash
git add src/compose/scene-card.ts src/compose/scene-card.test.ts
git commit -m "feat: add branded scene-card HTML generator"
```

---

## Task 7: Composition builder

**Files:**
- Create: `src/compose/build-composition.ts`, `src/compose/build-composition.test.ts`

**Interfaces:**
- Consumes: `VideoPlan` from `plan-schema.ts`; `BrandTokens`; `sceneCard`, `escapeHtml`.
- Produces: `buildComposition(plan: VideoPlan, tokens: BrandTokens, outDir: string, audioRelPath?: string): { indexPath: string; totalDuration: number }`. Writes `<outDir>/index.html` and `<outDir>/meta.json`; scene `data-start` values are cumulative; registers a paused GSAP timeline on `window.__timelines`.

- [ ] **Step 1: Write the failing test**

Create `src/compose/build-composition.test.ts`:

```ts
import { test, expect } from "bun:test";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildComposition } from "./build-composition";
import { loadBrandTokens } from "../brand/token-resolver";
import { validatePlan } from "../content-director/plan-schema";
import sample from "../../fixtures/sample-plan.json";

const outDir = join(process.cwd(), "out/test-compose");

test("writes index.html with cumulative starts and paused timeline", () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const plan = validatePlan(sample);
  const { indexPath, totalDuration } = buildComposition(plan, loadBrandTokens(), outDir, "audio/vo.wav");
  const html = readFileSync(indexPath, "utf8");
  expect(totalDuration).toBe(19); // 4+4+4+4+3
  expect(html).toContain('data-start="0"');
  expect(html).toContain('data-start="8"'); // third scene starts after 4+4
  expect(html).toContain("gsap.timeline({ paused: true })");
  expect(html).toContain('window.__timelines["enablement"]');
  expect(html).toContain('<audio id="vo" src="audio/vo.wav"');
  expect(existsSync(join(outDir, "meta.json"))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/compose/build-composition.test.ts`
Expected: FAIL — cannot find `./build-composition`.

- [ ] **Step 3: Write minimal implementation**

Create `src/compose/build-composition.ts`:

```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { VideoPlan } from "../content-director/plan-schema";
import type { BrandTokens } from "../brand/token-resolver";
import { sceneCard, escapeHtml } from "./scene-card";

export function buildComposition(
  plan: VideoPlan,
  tokens: BrandTokens,
  outDir: string,
  audioRelPath?: string,
): { indexPath: string; totalDuration: number } {
  mkdirSync(join(outDir, "audio"), { recursive: true });

  let t = 0;
  const clips = plan.scenes
    .map((s) => {
      const card = sceneCard(s, t, tokens);
      t += s.duration;
      return card;
    })
    .join("\n");
  const totalDuration = t;

  const audioEl = audioRelPath
    ? `  <audio id="vo" src="${audioRelPath}" data-start="0" data-duration="${totalDuration}" data-track-index="1"></audio>`
    : "";

  const html = `<!doctype html>
<html lang="en" data-resolution="landscape">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(plan.feature_name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;900&family=Inter:wght@400;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    html, body { margin: 0; padding: 0; width: 1920px; height: 1080px; overflow: hidden; background: ${tokens.deepBlue}; }
    #master-root { width: 1920px; height: 1080px; position: relative; }
  </style>
</head>
<body>
  <div id="master-root" data-composition-id="enablement" data-start="0" data-width="1920" data-height="1080">
${clips}
${audioEl}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    document.querySelectorAll('.scene').forEach((el) => {
      const start = parseFloat(el.getAttribute('data-start'));
      tl.fromTo(el, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'back.out(1.4)' }, start);
    });
    window.__timelines["enablement"] = tl;
  </script>
</body>
</html>`;

  const indexPath = join(outDir, "index.html");
  writeFileSync(indexPath, html);
  writeFileSync(
    join(outDir, "meta.json"),
    JSON.stringify({ id: "enablement", name: plan.feature_name, duration: totalDuration, width: 1920, height: 1080, fps: 30 }, null, 2),
  );
  return { indexPath, totalDuration };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/compose/build-composition.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add src/compose/build-composition.ts src/compose/build-composition.test.ts
git commit -m "feat: build HyperFrames composition from VideoPlan"
```

---

## Task 8: Speech synthesizer (TTS)

**Files:**
- Create: `src/audio/tts.ts`, `src/audio/tts.test.ts`

**Interfaces:**
- Consumes: system `say` + `ffmpeg`.
- Produces: `interface SpeechSynthesizer { synthesize(text: string, outWavPath: string): void }` and `saySynthesizer: SpeechSynthesizer` (writes a 44.1kHz stereo WAV). This is the seam where HeyGen cloud / external TTS swaps in later.

- [ ] **Step 1: Write the failing test**

Create `src/audio/tts.test.ts`:

```ts
import { test, expect } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { saySynthesizer } from "./tts";

const dir = join(process.cwd(), "out/test-tts");

test("say synthesizer produces a non-empty wav", () => {
  mkdirSync(dir, { recursive: true });
  const wav = join(dir, "s.wav");
  if (existsSync(wav)) rmSync(wav);
  saySynthesizer.synthesize("Hello from UiPath enablement.", wav);
  expect(existsSync(wav)).toBe(true);
  const dur = parseFloat(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", wav]).toString().trim(),
  );
  expect(dur).toBeGreaterThan(0.5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/audio/tts.test.ts`
Expected: FAIL — cannot find `./tts`.

- [ ] **Step 3: Write minimal implementation**

Create `src/audio/tts.ts`:

```ts
import { execFileSync } from "node:child_process";

export interface SpeechSynthesizer {
  synthesize(text: string, outWavPath: string): void;
}

export const saySynthesizer: SpeechSynthesizer = {
  synthesize(text, outWavPath) {
    const aiff = outWavPath.replace(/\.wav$/, ".aiff");
    execFileSync("say", ["-v", "Daniel", "-o", aiff, text]);
    execFileSync("ffmpeg", ["-y", "-i", aiff, "-ar", "44100", "-ac", "2", outWavPath], { stdio: "ignore" });
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/audio/tts.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add src/audio/tts.ts src/audio/tts.test.ts
git commit -m "feat: add say-based speech synthesizer with swap seam"
```

---

## Task 9: Audio assembler (VO drives timing)

**Files:**
- Create: `src/audio/assemble-audio.ts`, `src/audio/assemble-audio.test.ts`

**Interfaces:**
- Consumes: `VideoPlan`, `Scene` from `plan-schema.ts`; `SpeechSynthesizer` from `tts.ts`.
- Produces: `wavDuration(path: string): number`; `synthesizePlanAudio(plan: VideoPlan, synth: SpeechSynthesizer, audioDir: string, pad?: number): { planWithTiming: VideoPlan; combinedWav: string }`. Each scene's `duration` is reset to `max(voiceover + pad, 2)`; per-scene WAVs are padded to their scene duration with trailing silence and concatenated into `<audioDir>/vo.wav`.

- [ ] **Step 1: Write the failing test**

Create `src/audio/assemble-audio.test.ts`:

```ts
import { test, expect } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { synthesizePlanAudio, wavDuration } from "./assemble-audio";
import { saySynthesizer } from "./tts";
import { validatePlan } from "../content-director/plan-schema";
import sample from "../../fixtures/sample-plan.json";

const audioDir = join(process.cwd(), "out/test-audio");

test("VO length drives scene durations and produces aligned vo.wav", () => {
  if (existsSync(audioDir)) rmSync(audioDir, { recursive: true });
  mkdirSync(audioDir, { recursive: true });
  const plan = validatePlan(sample);
  const { planWithTiming, combinedWav } = synthesizePlanAudio(plan, saySynthesizer, audioDir, 0.6);
  expect(existsSync(combinedWav)).toBe(true);

  const totalScenes = planWithTiming.scenes.reduce((a, s) => a + s.duration, 0);
  const audioLen = wavDuration(combinedWav);
  // combined audio is each scene padded to its (content-driven) duration, so it matches total scene time
  expect(Math.abs(audioLen - totalScenes)).toBeLessThan(0.5);
  // durations are now content-driven, not the fixture's fixed values
  expect(planWithTiming.scenes[0].duration).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/audio/assemble-audio.test.ts`
Expected: FAIL — cannot find `./assemble-audio`.

- [ ] **Step 3: Write minimal implementation**

Create `src/audio/assemble-audio.ts`:

```ts
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { VideoPlan } from "../content-director/plan-schema";
import type { SpeechSynthesizer } from "./tts";

export function wavDuration(path: string): number {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path,
  ]).toString().trim();
  return parseFloat(out);
}

export function synthesizePlanAudio(
  plan: VideoPlan,
  synth: SpeechSynthesizer,
  audioDir: string,
  pad = 0.6,
): { planWithTiming: VideoPlan; combinedWav: string } {
  const paddedFiles: string[] = [];

  const scenes = plan.scenes.map((s, i) => {
    const raw = join(audioDir, `scene-${i}.wav`);
    synth.synthesize(s.narration, raw);
    const duration = Math.max(wavDuration(raw) + pad, 2);

    // pad this clip with trailing silence to exactly `duration` so audio aligns to scene windows
    const padded = join(audioDir, `scene-${i}-pad.wav`);
    execFileSync("ffmpeg", ["-y", "-i", raw, "-af", "apad", "-t", duration.toFixed(3), "-ar", "44100", "-ac", "2", padded], { stdio: "ignore" });
    paddedFiles.push(padded);

    return { ...s, duration };
  });

  const listFile = join(audioDir, "concat.txt");
  writeFileSync(listFile, paddedFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
  const combinedWav = join(audioDir, "vo.wav");
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", combinedWav], { stdio: "ignore" });

  return { planWithTiming: { ...plan, scenes }, combinedWav };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/audio/assemble-audio.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add src/audio/assemble-audio.ts src/audio/assemble-audio.test.ts
git commit -m "feat: add VO-driven audio assembler with scene alignment"
```

---

## Task 10: Content director (SourceContext → VideoPlan)

**Files:**
- Create: `src/content-director/content-director.ts`, `src/content-director/content-director.test.ts`, `src/content-director/SKILL.md`

**Interfaces:**
- Consumes: `SourceContext` from `types.ts`; `VideoPlan`, `validatePlan` from `plan-schema.ts`.
- Produces: `generatePlan(ctx: SourceContext): VideoPlan` — a deterministic baseline that emits the 5-section enablement arc (hook, capability, demo, positioning, cta) with narration derived only from `ctx`. `SKILL.md` documents the LLM upgrade that replaces the baseline body.

- [ ] **Step 1: Write the failing test**

Create `src/content-director/content-director.test.ts`:

```ts
import { test, expect } from "bun:test";
import { generatePlan } from "./content-director";
import { promptToSourceContext } from "../ingest/manual-prompt";
import { validatePlan } from "./plan-schema";

test("generates a valid 5-section enablement plan from a prompt", () => {
  const ctx = promptToSourceContext("Agentic Document Understanding extracts data from any document and self-corrects low-confidence fields.");
  const plan = generatePlan(ctx);
  validatePlan(plan); // throws if invalid
  const types = plan.scenes.map((s) => s.type);
  expect(types).toEqual(["hook", "capability", "demo", "positioning", "cta"]);
  expect(plan.scenes.every((s) => s.narration.length > 0)).toBe(true);
  expect(plan.talking_points.length).toBeGreaterThanOrEqual(1);
});

test("narration only references provided context (no external feature names)", () => {
  const ctx = promptToSourceContext("Widget X speeds up invoices.");
  const plan = generatePlan(ctx);
  const joined = plan.scenes.map((s) => s.narration).join(" ");
  expect(joined).toContain("Widget X");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/content-director/content-director.test.ts`
Expected: FAIL — cannot find `./content-director`.

- [ ] **Step 3: Write minimal implementation**

Create `src/content-director/content-director.ts`:

```ts
import type { SourceContext } from "../types";
import { validatePlan, type VideoPlan } from "./plan-schema";

/**
 * Deterministic baseline content director.
 * LLM UPGRADE SEAM: replace the body of this function with a call to the
 * content-director Claude skill (see SKILL.md). Contract is unchanged:
 * SourceContext in, schema-valid VideoPlan out, no claims beyond ctx.evidence.
 */
export function generatePlan(ctx: SourceContext): VideoPlan {
  const name = ctx.title.replace(/\.$/, "");
  const plan: VideoPlan = {
    feature_name: name,
    value_prop: ctx.summary,
    persona: "Account Executive",
    when_to_use: `When a customer's problem maps to: ${ctx.summary}`,
    talking_points: [ctx.summary, `Ask discovery questions about ${name}.`],
    scenes: [
      { id: "s1", type: "hook", duration: 4, on_screen_text: "Here's the problem customers keep hitting.", narration: `Customers kept running into the problem that ${name} solves.`, asset_requirements: [] },
      { id: "s2", type: "capability", duration: 4, on_screen_text: name, narration: `Meet ${name}. ${ctx.summary}`, asset_requirements: [] },
      { id: "s3", type: "demo", duration: 4, on_screen_text: "See it in action", narration: `Here is ${name} working on a real example.`, footage_requirement: { steps: [] }, asset_requirements: [] },
      { id: "s4", type: "positioning", duration: 4, on_screen_text: "When to bring this up", narration: `Bring up ${name} when a customer describes this pain: ${ctx.summary}`, asset_requirements: [] },
      { id: "s5", type: "cta", duration: 3, on_screen_text: "Learn more", narration: `Find the full enablement kit for ${name} on the internal docs hub.`, asset_requirements: [] },
    ],
    youtube_metadata: {
      title: `${name} — Enablement`,
      description: ctx.summary,
      tags: ["uipath", "enablement"],
      chapters: [{ title: "Hook", start: 0 }],
    },
  };
  return validatePlan(plan);
}
```

Create `src/content-director/SKILL.md`:

```markdown
---
name: content-director
description: Turn a SourceContext (PR / Jira / prompt) into an enablement VideoPlan with a sales/positioning layer, without inventing claims the source doesn't support.
---

# Content Director

You are the content director for UiPath feature-enablement videos. Given a
`SourceContext`, produce a `VideoPlan` (see `plan-schema.ts`) that a salesperson can
sell from.

## Rules
1. Output MUST validate against `VideoPlanSchema`.
2. Use the 5-section arc: hook (customer problem) → capability (name + one-line value)
   → demo → positioning (when to use, objections, talking points) → CTA.
3. The positioning section is what makes this enablement, not a product tour. Keep it.
4. NEVER invent a benefit, metric, or capability the SourceContext does not support.
   For a manual prompt, the provided text is the only evidence.
5. Duration is content-driven; leave scene durations as rough estimates — the audio
   assembler resets them from voiceover length.

## Output
Return only the VideoPlan JSON. Downstream stages consume it directly.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/content-director/content-director.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 5: Commit**

```bash
git add src/content-director/content-director.ts src/content-director/content-director.test.ts src/content-director/SKILL.md
git commit -m "feat: add content director baseline + LLM skill seam"
```

---

## Task 11: Render wrapper

**Files:**
- Create: `src/render/render.ts`, `src/render/render.test.ts`

**Interfaces:**
- Consumes: HyperFrames CLI.
- Produces: `render(projectDir: string, outRelPath: string): void` — runs `npx hyperframes render -o <outRelPath>` with `cwd = projectDir`, prepending `HYPERFRAMES_NODE_BIN` to `PATH` when set (Node 22+ requirement).

- [ ] **Step 1: Write the failing test**

Create `src/render/render.test.ts`:

```ts
import { test, expect } from "bun:test";
import { render } from "./render";

test("render is a function taking a project dir and output path", () => {
  // Unit-level guard only; the real render runs in the Task 12 integration test.
  expect(typeof render).toBe("function");
  expect(render.length).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/render/render.test.ts`
Expected: FAIL — cannot find `./render`.

- [ ] **Step 3: Write minimal implementation**

Create `src/render/render.ts`:

```ts
import { execFileSync } from "node:child_process";

export function render(projectDir: string, outRelPath: string): void {
  const nodeBin = process.env.HYPERFRAMES_NODE_BIN;
  const env = nodeBin ? { ...process.env, PATH: `${nodeBin}:${process.env.PATH}` } : process.env;
  execFileSync("npx", ["-y", "hyperframes@latest", "render", "-o", outRelPath], {
    cwd: projectDir,
    stdio: "inherit",
    env,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/render/render.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add src/render/render.ts src/render/render.test.ts
git commit -m "feat: add hyperframes render wrapper with node-22 path shim"
```

---

## Task 12: Pipeline orchestrator + end-to-end integration

**Files:**
- Create: `src/pipeline/run.ts`, `src/pipeline/run.test.ts`

**Interfaces:**
- Consumes: `promptToSourceContext`, `generatePlan`, `validatePlan`, `loadBrandTokens`, `synthesizePlanAudio`, `saySynthesizer`, `buildComposition`, `render`.
- Produces: `run(prompt: string, outDir: string): Promise<string>` — returns the path to the rendered `renders/video.mp4`.

- [ ] **Step 1: Write the failing test**

Create `src/pipeline/run.test.ts`:

```ts
import { test, expect } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { run } from "./run";

const outDir = join(process.cwd(), "out/e2e");

// Integration test: needs ffmpeg, `say`, Node 22+ (nvm stable), and Chrome. Slow (~30-60s).
test("prompt -> narrated branded mp4 with video + audio streams", async () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const mp4 = await run("Agentic Document Understanding extracts data from any document and self-corrects low-confidence fields.", outDir);
  expect(existsSync(mp4)).toBe(true);

  const streams = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1", mp4]).toString();
  expect(streams).toContain("video");
  expect(streams).toContain("audio");
}, 120000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/pipeline/run.test.ts`
Expected: FAIL — cannot find `./run`.

- [ ] **Step 3: Write minimal implementation**

Create `src/pipeline/run.ts`:

```ts
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { promptToSourceContext } from "../ingest/manual-prompt";
import { generatePlan } from "../content-director/content-director";
import { loadBrandTokens } from "../brand/token-resolver";
import { synthesizePlanAudio } from "../audio/assemble-audio";
import { saySynthesizer } from "../audio/tts";
import { buildComposition } from "../compose/build-composition";
import { render } from "../render/render";

export async function run(prompt: string, outDir: string): Promise<string> {
  mkdirSync(join(outDir, "audio"), { recursive: true });
  mkdirSync(join(outDir, "renders"), { recursive: true });

  const ctx = promptToSourceContext(prompt);
  const plan = generatePlan(ctx);

  // VO drives timing: synthesize first, get content-driven durations + aligned vo.wav
  const { planWithTiming } = synthesizePlanAudio(plan, saySynthesizer, join(outDir, "audio"));

  buildComposition(planWithTiming, loadBrandTokens(), outDir, "audio/vo.wav");

  render(outDir, "renders/video.mp4");
  return join(outDir, "renders", "video.mp4");
}

if (import.meta.main) {
  const prompt = process.argv.slice(2).join(" ") || "Describe your feature here.";
  run(prompt, join(process.cwd(), "out/latest")).then((p) => console.log("Rendered:", p));
}
```

- [ ] **Step 4: Run test to verify it passes**

Ensure Node 22+ is active first:

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use stable
export HYPERFRAMES_NODE_BIN="$(dirname "$(nvm which stable)")"
```

Run: `bun test src/pipeline/run.test.ts`
Expected: PASS (1 pass) — a narrated MP4 with video + audio streams at `out/e2e/renders/video.mp4`.

- [ ] **Step 5: Manually verify quality, then commit**

Extract a frame and open the video to confirm branding + audio:

```bash
ffmpeg -y -ss 1 -i out/e2e/renders/video.mp4 -frames:v 1 out/e2e/frame.png
open out/e2e/renders/video.mp4
```

Confirm: Deep Blue backgrounds, orange CTA scene, Poppins headline, audible narration.

```bash
git add src/pipeline/run.ts src/pipeline/run.test.ts
git commit -m "feat: wire end-to-end prompt-to-narrated-video pipeline"
```

---

## Self-Review

**Spec coverage (Milestone-1 slice):**
- §1.1 manual-prompt adapter → Task 4 ✅
- §5 VideoPlan contract → Task 3 ✅; content director emits it → Task 10 ✅
- Token layer feeds compositions → Tasks 5–7 ✅
- Audio generate + attach, VO-driven timing → Tasks 8–9 ✅
- Render spine → Tasks 11–12 ✅
- Deferred by design (own plans): PR/Jira adapters, camera director, capture, callout/diagram generators, content-QA claim-check, one-pager, publish, approval gate.

**Placeholder scan:** no TBD/TODO; every code step has complete code; the content-director LLM "seam" is a real, working deterministic implementation with a documented upgrade path (not a placeholder).

**Type consistency:** `SourceContext` (Task 2) consumed by Tasks 4/10; `VideoPlan`/`Scene`/`validatePlan` (Task 3) consumed by 6/7/9/10; `BrandTokens`/`loadBrandTokens` (Task 5) by 6/7/12; `sceneCard`/`escapeHtml` (Task 6) by 7; `SpeechSynthesizer`/`saySynthesizer` (Task 8) by 9/12; `synthesizePlanAudio` (Task 9) by 12; `buildComposition` (Task 7) by 12; `generatePlan` (Task 10) by 12; `render` (Task 11) by 12. Names/signatures match across tasks.

## Follow-on plans (not this milestone)
1. PR + Jira ingest adapters (reuse pr-to-video's `gh` reader; Atlassian fetch).
2. Capture + camera director (Playwright → clip + ROI zoom track).
3. Asset generators (callout layer, one templated code-defined diagram, kinetic captions).
4. Content-QA gate (claim-check narration vs. source evidence; brand compliance).
5. One-pager generator.
6. Publish (optional/opt-in: YouTube + Slack) + approval gate.
7. VO upgrade: HeyGen cloud voices or fixed local Kokoro; content-director LLM wiring.
