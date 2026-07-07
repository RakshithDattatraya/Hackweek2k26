# Creative Scene Library + Director Skill — Implementation Plan (Milestone 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the hand-authored creative scenes from `demo/build-video.ts` into a reusable, validated **scene-component library** driven by an **enriched VideoPlan v2**, so a Claude **director skill** can auto-produce premium, on-brand videos from a prompt.

**Architecture:** A deterministic renderer (component registry + composition builder v2 + orchestrator) consumes an enriched plan (`{component, props, narration}` per scene). Each scene component is an isolated unit with its own zod props-schema; a registry dispatches by name and validates props (the guardrail for fully-adaptive plans). Motion, kinetic captions, and the Ava premium voice are baked into the build. A Claude skill authors the plan.

**Tech Stack:** TypeScript, bun (`bun test`), zod, HyperFrames CLI (render + transcribe), FFmpeg, macOS `say` (Ava Premium voice via the SpeechSynthesizer seam).

## Global Constraints

- **Node 22+ for the HyperFrames CLI** (render/transcribe). Keep `nvm use stable` (v24) active, or set `HYPERFRAMES_NODE_BIN` (the render/transcribe wrappers prepend it to PATH).
- **Runtime/package manager: bun.** Tests via `bun test`. TypeScript run directly (no build step).
- **Brand tokens are the single source of truth** (`brand/uipath-tokens.json` via `loadBrandTokens`). No component hardcodes brand colors/fonts.
- **HyperFrames composition rules:** every timed element has `class="clip"` + `data-start` + `data-duration` + `data-track-index`; GSAP timeline `paused` and registered on `window.__timelines["feature-video"]`; deterministic only (no `Date.now`/`Math.random`; only the GSAP + Google-Fonts CDN links, which are an accepted decision for local render).
- **Duration is VO-driven** — scene durations come from narration length; no fixed arc, no fixed total.
- **Fully-adaptive guardrail:** a plan renders only if every scene's `component` exists in the registry AND its `props` pass that component's zod schema; otherwise fail loudly.
- **No invented claims:** narration/props content must derive only from the source (enforced by the director skill; not a code check in this milestone).
- **Canvas 1920×1080 @ 30fps.**
- **Reuse Milestone-1 modules unchanged:** `src/brand/token-resolver.ts`, `src/audio/tts.ts`, `src/audio/assemble-audio.ts`, `src/render/render.ts`, `src/compose/scene-card.ts` (for `escapeHtml`).

---

## File Structure

```
src/
  content-director/plan-schema.ts   # MODIFY: add SceneV2Schema, VideoPlanV2Schema, validatePlanV2
  scenes/
    types.ts                        # SceneComponent interface + shared esc()
    intro.ts statement.ts cta.ts    # text-family components
    slack.ts gap.ts flow.ts capability.ts bigstat.ts
    registry.ts                     # name → component; renderScene(); validateScenePlan()
  compose/
    build-composition-v2.ts         # buildCompositionV2(): dispatch via registry + motion + shell + CSS
  pipeline/
    build-plan.ts                   # orchestrator: plan.v2.json → VO → transcribe → compose → render
fixtures/
  sample-plan.v2.json               # golden enriched plan (integration fixture)
.claude/skills/enablement-video/
  SKILL.md                          # the director (creative direction)
```

CSS for all scenes lives once in `build-composition-v2.ts` (`<style>`); components return only structural HTML using those classes (DRY). All component `render` functions escape user text with `esc`.

---

## Task 1: VideoPlan v2 schema

**Files:**
- Modify: `src/content-director/plan-schema.ts`
- Test: `src/content-director/plan-schema-v2.test.ts`

**Interfaces:**
- Consumes: existing `plan-schema.ts` (zod imported there).
- Produces: `SceneV2Schema`, `VideoPlanV2Schema` (zod); types `SceneV2`, `VideoPlanV2`; `validatePlanV2(data: unknown): VideoPlanV2`. `SceneV2` = `{ id: string; component: string; props: Record<string, unknown>; narration: string; duration?: number; motion?: { pushScale?: number; pushY?: number; ease?: string; autoZoom?: boolean } }`.

- [ ] **Step 1: Write the failing test**

Create `src/content-director/plan-schema-v2.test.ts`:

```ts
import { test, expect } from "bun:test";
import { validatePlanV2 } from "./plan-schema";

const good = {
  feature_name: "Test", value_prop: "v", persona: "AE", when_to_use: "w", talking_points: ["a"],
  scenes: [{ id: "s1", component: "statement", props: { headline: "Hi" }, narration: "Hello there." }],
  youtube_metadata: { title: "t", description: "d", tags: [], chapters: [] },
};

test("valid v2 plan parses and defaults props", () => {
  const p = validatePlanV2(good);
  expect(p.scenes[0].component).toBe("statement");
  expect(p.scenes[0].narration).toBe("Hello there.");
});

test("scene missing component is rejected", () => {
  const bad = structuredClone(good) as any;
  delete bad.scenes[0].component;
  expect(() => validatePlanV2(bad)).toThrow();
});

test("empty narration is rejected", () => {
  const bad = structuredClone(good) as any;
  bad.scenes[0].narration = "";
  expect(() => validatePlanV2(bad)).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/content-director/plan-schema-v2.test.ts`
Expected: FAIL — `validatePlanV2` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/content-director/plan-schema.ts`:

```ts
export const SceneMotionSchema = z.object({
  pushScale: z.number().optional(),
  pushY: z.number().optional(),
  ease: z.string().optional(),
  autoZoom: z.boolean().optional(),
});

export const SceneV2Schema = z.object({
  id: z.string().min(1),
  component: z.string().min(1),
  props: z.record(z.string(), z.unknown()).default({}),
  narration: z.string().min(1),
  duration: z.number().positive().optional(),
  motion: SceneMotionSchema.optional(),
});

export const VideoPlanV2Schema = z.object({
  feature_name: z.string().min(1),
  value_prop: z.string(),
  persona: z.string(),
  when_to_use: z.string(),
  talking_points: z.array(z.string()).min(1),
  scenes: z.array(SceneV2Schema).min(1),
  youtube_metadata: z.object({
    title: z.string(), description: z.string(),
    tags: z.array(z.string()), chapters: z.array(z.object({ title: z.string(), start: z.number().nonnegative() })),
  }),
});

export type SceneV2 = z.infer<typeof SceneV2Schema>;
export type VideoPlanV2 = z.infer<typeof VideoPlanV2Schema>;

export function validatePlanV2(data: unknown): VideoPlanV2 {
  return VideoPlanV2Schema.parse(data);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/content-director/plan-schema-v2.test.ts`
Expected: PASS (3 pass).

- [ ] **Step 5: Commit**

```bash
git add src/content-director/plan-schema.ts src/content-director/plan-schema-v2.test.ts
git commit -m "feat: add VideoPlan v2 schema (component + props + motion)"
```

---

## Task 2: Scene component type + shared helper

**Files:**
- Create: `src/scenes/types.ts`
- Test: `src/scenes/types.test.ts`

**Interfaces:**
- Consumes: `BrandTokens` from `src/brand/token-resolver.ts`; `escapeHtml` from `src/compose/scene-card.ts`.
- Produces: `interface SceneComponent { propsSchema: z.ZodType; render(props: any, tokens: BrandTokens): string }`; `esc(s: string): string` (re-export of escapeHtml).

- [ ] **Step 1: Write the failing test**

Create `src/scenes/types.test.ts`:

```ts
import { test, expect } from "bun:test";
import { esc } from "./types";

test("esc escapes html-significant characters", () => {
  expect(esc(`<a>&"`)).toBe("&lt;a&gt;&amp;&quot;");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/scenes/types.test.ts`
Expected: FAIL — cannot find `./types`.

- [ ] **Step 3: Write minimal implementation**

Create `src/scenes/types.ts`:

```ts
import type { z } from "zod";
import type { BrandTokens } from "../brand/token-resolver";
import { escapeHtml } from "../compose/scene-card";

export interface SceneComponent {
  propsSchema: z.ZodType;
  render(props: any, tokens: BrandTokens): string;
}

export const esc = escapeHtml;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/scenes/types.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/types.ts src/scenes/types.test.ts
git commit -m "feat: add SceneComponent interface + shared esc helper"
```

---

## Task 3: Text-family components (intro, statement, cta)

**Files:**
- Create: `src/scenes/intro.ts`, `src/scenes/statement.ts`, `src/scenes/cta.ts`
- Test: `src/scenes/text-components.test.ts`

**Interfaces:**
- Consumes: `SceneComponent`, `esc` from `./types`; `BrandTokens`.
- Produces: `intro`, `statement`, `cta` (each a `SceneComponent`). `statement` props `{ eyebrow?, eyebrowColor?, headline, highlight?, sub? }`; `intro` props `{ tagline }`; `cta` props `{ headline }`. render() returns inner HTML using shared CSS classes (`.logo`, `.introtag`, `.eyebrow`, `h1`, `.sub`, `.ctacard`) with `class="anim"` on animatable children.

- [ ] **Step 1: Write the failing test**

Create `src/scenes/text-components.test.ts`:

```ts
import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { intro } from "./intro";
import { statement } from "./statement";
import { cta } from "./cta";

const t = loadBrandTokens();

test("statement renders headline with highlight and escapes", () => {
  const html = statement.render(statement.propsSchema.parse({ eyebrow: "The insight", headline: "A & B", highlight: "B", sub: "s" }), t);
  expect(html).toContain("The insight");
  expect(html).toContain("A &amp; B".replace("B", "")); // "A &amp; " present
  expect(html).toContain('class="anim"');
});

test("intro renders tagline + logo", () => {
  const html = intro.render(intro.propsSchema.parse({ tagline: "Automatically." }), t);
  expect(html).toContain("Automatically.");
  expect(html).toContain("assets/uipath-logo-orange.png");
});

test("cta renders headline", () => {
  const html = cta.render(cta.propsSchema.parse({ headline: "From merge to enablement." }), t);
  expect(html).toContain("From merge to enablement.");
  expect(html).toContain("ctacard");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/scenes/text-components.test.ts`
Expected: FAIL — cannot find `./intro`.

- [ ] **Step 3: Write minimal implementation**

Create `src/scenes/intro.ts`:

```ts
import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

export const intro: SceneComponent = {
  propsSchema: z.object({ tagline: z.string() }),
  render(props, t) {
    return `<img class="anim logo big" src="assets/uipath-logo-orange.png" alt="UiPath" />
      <div class="anim introtag">${esc(props.tagline)}</div>`;
  },
};
```

Create `src/scenes/statement.ts`:

```ts
import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

export const statement: SceneComponent = {
  propsSchema: z.object({
    eyebrow: z.string().optional(), eyebrowColor: z.string().optional(),
    headline: z.string(), highlight: z.string().optional(), sub: z.string().optional(),
  }),
  render(props, t) {
    let headline = esc(props.headline);
    if (props.highlight) {
      const h = esc(props.highlight);
      headline = headline.replace(h, `<span style="color:${t.teal}">${h}</span>`);
    }
    const eyebrow = props.eyebrow
      ? `<div class="eyebrow anim" style="color:${props.eyebrowColor || t.teal}"><i style="background:${props.eyebrowColor || t.teal}"></i>${esc(props.eyebrow)}</div>` : "";
    const sub = props.sub ? `<p class="sub anim">${esc(props.sub)}</p>` : "";
    return `${eyebrow}<h1 class="anim">${headline}</h1>${sub}`;
  },
};
```

Create `src/scenes/cta.ts`:

```ts
import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

export const cta: SceneComponent = {
  propsSchema: z.object({ headline: z.string() }),
  render(props, t) {
    return `<div class="ctacard anim"><img class="logo" src="assets/uipath-logo-orange.png" alt="UiPath" /></div>
      <h1 class="anim" style="margin-top:48px;text-align:center">${esc(props.headline)}</h1>`;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/scenes/text-components.test.ts`
Expected: PASS (3 pass).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/intro.ts src/scenes/statement.ts src/scenes/cta.ts src/scenes/text-components.test.ts
git commit -m "feat: add intro, statement, cta scene components"
```

---

## Task 4: Slack component

**Files:**
- Create: `src/scenes/slack.ts`
- Test: `src/scenes/slack.test.ts`

**Interfaces:**
- Produces: `slack` (`SceneComponent`). Props: `{ channel: string, members: number, messages: {color,initials,name,time,text}[] }`. render() returns the authentic Slack window HTML (sidebar + message pane) using shared CSS classes (`.slackwin`, `.slack-sb`, `.slack-main`, `.srow`, `.savatar`, …), with each message row `class="anim srow"`.

- [ ] **Step 1: Write the failing test**

Create `src/scenes/slack.test.ts`:

```ts
import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { slack } from "./slack";

const t = loadBrandTokens();

test("slack renders header/messages, allowlists <b>, escapes the rest", () => {
  const html = slack.render(slack.propsSchema.parse({
    channel: "sales-help", members: 12,
    messages: [{ color: "#E01E5A", initials: "PS", name: "Priya", time: "9:41 AM", text: "a <b>bold</b> claim & <script>x</script>" }],
  }), t);
  expect(html).toContain("# sales-help");
  expect(html).toContain("12 members");
  expect(html).toContain("Priya");
  expect(html).toContain('class="anim srow"');
  expect(html).toContain("#E01E5A");
  expect(html).toContain("<b>bold</b>");      // allowlisted bold preserved
  expect(html).toContain("&amp;");             // ampersand escaped
  expect(html).toContain("&lt;script&gt;");    // script tag escaped
  expect(html).not.toContain("<script>");      // never raw
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/scenes/slack.test.ts`
Expected: FAIL — cannot find `./slack`.

- [ ] **Step 3: Write minimal implementation**

Create `src/scenes/slack.ts` (message `text` is escaped with a `<b>`-allowlist so the director can use bold safely; all other fields are fully escaped):

```ts
import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

// escape everything, then re-allow only <b>/</b>
const fmt = (s: string) => esc(s).replace(/&lt;(\/?)b&gt;/g, "<$1b>");

export const slack: SceneComponent = {
  propsSchema: z.object({
    channel: z.string(), members: z.number(),
    messages: z.array(z.object({
      color: z.string(), initials: z.string(), name: z.string(), time: z.string(), text: z.string(),
    })).min(1),
  }),
  render(props, t) {
    const rows = props.messages.map((m: any) => `
      <div class="anim srow"><div class="savatar" style="background:${esc(m.color)}">${esc(m.initials)}</div>
        <div class="scol"><div class="shead"><span class="sname">${esc(m.name)}</span><span class="stime">${esc(m.time)}</span></div>
          <div class="stext">${fmt(m.text)}</div></div></div>`).join("");
    return `<div class="slackwin">
      <div class="slack-sb"><div class="sb-ws">UiPath <span class="sb-caret">⌄</span></div>
        <div class="sb-sec">Channels</div>
        <div class="sb-ch"><span class="sb-hash">#</span>general</div>
        <div class="sb-ch active"><span class="sb-hash">#</span>${esc(props.channel)}</div>
        <div class="sb-ch"><span class="sb-hash">#</span>customer-wins</div></div>
      <div class="slack-main"><div class="slack-hd"><span class="hd-ch"># ${esc(props.channel)}</span><span class="hd-meta">&nbsp;&nbsp;${props.members} members</span></div>
        <div class="slack-body">${rows}</div>
        <div class="slack-compose"><span>Message #${esc(props.channel)}</span></div></div></div>`;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/scenes/slack.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/slack.ts src/scenes/slack.test.ts
git commit -m "feat: add authentic Slack scene component"
```

---

## Task 5: Gap component

**Files:**
- Create: `src/scenes/gap.ts`
- Test: `src/scenes/gap.test.ts`

**Interfaces:**
- Produces: `gap` (`SceneComponent`). Props: `{ eyebrow, headline, left:{icon,title,sub}, right:{icon,title,sub}, chasmLabel }`. render() returns the two-panel + dashed-chasm metaphor using shared classes (`.gapviz`, `.shore`, `.chasm`, …); left panel bordered teal, right orange.

- [ ] **Step 1: Write the failing test**

Create `src/scenes/gap.test.ts`:

```ts
import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { gap } from "./gap";

const t = loadBrandTokens();

test("gap renders both shores, chasm label, headline", () => {
  const html = gap.render(gap.propsSchema.parse({
    eyebrow: "The problem", headline: "The gap.",
    left: { icon: "✓", title: "Engineering", sub: "full context" },
    right: { icon: "?", title: "Sales", sub: "last to know" },
    chasmLabel: "weeks pass",
  }), t);
  expect(html).toContain("Engineering");
  expect(html).toContain("Sales");
  expect(html).toContain("weeks pass");
  expect(html).toContain("gapviz");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/scenes/gap.test.ts`
Expected: FAIL — cannot find `./gap`.

- [ ] **Step 3: Write minimal implementation**

Create `src/scenes/gap.ts`:

```ts
import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

const shore = z.object({ icon: z.string(), title: z.string(), sub: z.string() });

export const gap: SceneComponent = {
  propsSchema: z.object({ eyebrow: z.string(), headline: z.string(), left: shore, right: shore, chasmLabel: z.string() }),
  render(props, t) {
    const panel = (s: any, color: string, tint: string) => `
      <div class="shore anim" style="border-color:${color}"><div class="shore-icon" style="background:${tint};color:${color}">${esc(s.icon)}</div>
        <div class="shore-t">${esc(s.title)}</div><div class="shore-s">${esc(s.sub)}</div></div>`;
    return `<div class="eyebrow anim" style="color:${t.orange}"><i></i>${esc(props.eyebrow)}</div>
      <h1 class="anim" style="margin-bottom:64px">${esc(props.headline)}</h1>
      <div class="gapviz">
        ${panel(props.left, t.teal, "rgba(11,162,179,.15)")}
        <div class="chasm anim"><div class="chasm-dot" style="background:${t.orange}"></div><div class="chasm-line"></div>
          <div class="chasm-lbl">${esc(props.chasmLabel)}</div></div>
        ${panel(props.right, t.orange, "rgba(250,70,22,.15)")}</div>`;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/scenes/gap.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/gap.ts src/scenes/gap.test.ts
git commit -m "feat: add gap-metaphor scene component"
```

---

## Task 6: Flow + capability components

**Files:**
- Create: `src/scenes/flow.ts`, `src/scenes/capability.ts`
- Test: `src/scenes/flow-capability.test.ts`

**Interfaces:**
- Produces: `flow` (props `{ eyebrow, nodes:{icon,label}[], highlightIndex? }`) and `capability` (props `{ eyebrow, items:{icon,title,desc}[] }`). render() uses shared classes (`.flow`, `.node`, `.arrow`, `.caps`, `.capic`).

- [ ] **Step 1: Write the failing test**

Create `src/scenes/flow-capability.test.ts`:

```ts
import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { flow } from "./flow";
import { capability } from "./capability";

const t = loadBrandTokens();

test("flow renders nodes with arrows between", () => {
  const html = flow.render(flow.propsSchema.parse({ eyebrow: "How it works", nodes: [{ icon: "📥", label: "Ingest" }, { icon: "⚙️", label: "Render" }] }), t);
  expect(html).toContain("Ingest");
  expect(html).toContain("Render");
  expect(html).toContain("arrow");
  expect((html.match(/class="node/g) || []).length).toBe(2);
});

test("capability renders items with icons", () => {
  const html = capability.render(capability.propsSchema.parse({ eyebrow: "Caps", items: [{ icon: "🎬", title: "Directors", desc: "two of them" }] }), t);
  expect(html).toContain("Directors");
  expect(html).toContain("two of them");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/scenes/flow-capability.test.ts`
Expected: FAIL — cannot find `./flow`.

- [ ] **Step 3: Write minimal implementation**

Create `src/scenes/flow.ts`:

```ts
import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

export const flow: SceneComponent = {
  propsSchema: z.object({
    eyebrow: z.string(),
    nodes: z.array(z.object({ icon: z.string(), label: z.string() })).min(1),
    highlightIndex: z.number().optional(),
  }),
  render(props, t) {
    const nodes = props.nodes.map((n: any, i: number, a: any[]) =>
      `<div class="node anim"><span class="node-ic">${esc(n.icon)}</span>${esc(n.label)}</div>${i < a.length - 1 ? `<div class="arrow anim">→</div>` : ""}`).join("");
    return `<div class="eyebrow anim" style="color:${t.teal};align-self:flex-start"><i style="background:${t.teal}"></i>${esc(props.eyebrow)}</div>
      <div class="flow">${nodes}</div>`;
  },
};
```

Create `src/scenes/capability.ts`:

```ts
import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

export const capability: SceneComponent = {
  propsSchema: z.object({
    eyebrow: z.string(),
    items: z.array(z.object({ icon: z.string(), title: z.string(), desc: z.string() })).min(1),
  }),
  render(props, t) {
    const items = props.items.map((it: any) =>
      `<li class="anim"><span class="capic">${esc(it.icon)}</span><span class="captx"><b>${esc(it.title)}</b><span class="capd">${esc(it.desc)}</span></span></li>`).join("");
    return `<div class="eyebrow anim" style="color:${t.teal};align-self:flex-start"><i style="background:${t.teal}"></i>${esc(props.eyebrow)}</div>
      <ul class="caps">${items}</ul>`;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/scenes/flow-capability.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/flow.ts src/scenes/capability.ts src/scenes/flow-capability.test.ts
git commit -m "feat: add flow + capability scene components"
```

---

## Task 7: Bigstat component (count-up)

**Files:**
- Create: `src/scenes/bigstat.ts`
- Test: `src/scenes/bigstat.test.ts`

**Interfaces:**
- Produces: `bigstat` (`SceneComponent`). Props: `{ eyebrow, number: string, unit?: string, caption: string }`. render() shows a large number (`.bigstat-num`) + caption; the number is a static string (e.g. "weeks → minutes" or "10×") — no JS count-up in this milestone (keeps determinism simple; motion is the scene push-in + entrance).

- [ ] **Step 1: Write the failing test**

Create `src/scenes/bigstat.test.ts`:

```ts
import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { bigstat } from "./bigstat";

const t = loadBrandTokens();

test("bigstat renders number, unit, caption", () => {
  const html = bigstat.render(bigstat.propsSchema.parse({ eyebrow: "Impact", number: "10", unit: "×", caption: "faster enablement" }), t);
  expect(html).toContain("10");
  expect(html).toContain("×");
  expect(html).toContain("faster enablement");
  expect(html).toContain("bigstat-num");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/scenes/bigstat.test.ts`
Expected: FAIL — cannot find `./bigstat`.

- [ ] **Step 3: Write minimal implementation**

Create `src/scenes/bigstat.ts`:

```ts
import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

export const bigstat: SceneComponent = {
  propsSchema: z.object({ eyebrow: z.string(), number: z.string(), unit: z.string().optional(), caption: z.string() }),
  render(props, t) {
    const unit = props.unit ? `<span class="bigstat-unit" style="color:${t.orange}">${esc(props.unit)}</span>` : "";
    return `<div class="eyebrow anim" style="color:${t.teal}"><i style="background:${t.teal}"></i>${esc(props.eyebrow)}</div>
      <div class="bigstat-num anim" style="color:${t.orange}">${esc(props.number)}${unit}</div>
      <p class="sub anim">${esc(props.caption)}</p>`;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/scenes/bigstat.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/bigstat.ts src/scenes/bigstat.test.ts
git commit -m "feat: add bigstat scene component"
```

---

## Task 8: Scene registry + validation

**Files:**
- Create: `src/scenes/registry.ts`
- Test: `src/scenes/registry.test.ts`

**Interfaces:**
- Consumes: all 8 components; `SceneV2`, `VideoPlanV2` from `plan-schema.ts`; `BrandTokens`.
- Produces: `SCENE_REGISTRY: Record<string, SceneComponent>`; `renderScene(scene: SceneV2, tokens: BrandTokens): string` (throws on unknown component; validates + parses props via the component schema before render); `validateScenePlan(plan: VideoPlanV2): void` (throws on any unknown component or invalid props, message names the scene id).

- [ ] **Step 1: Write the failing test**

Create `src/scenes/registry.test.ts`:

```ts
import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { renderScene, validateScenePlan, SCENE_REGISTRY } from "./registry";

const t = loadBrandTokens();

test("registry has the expected components", () => {
  for (const name of ["intro", "slack", "statement", "gap", "flow", "capability", "bigstat", "cta"]) {
    expect(SCENE_REGISTRY[name]).toBeDefined();
  }
});

test("renderScene dispatches by component name", () => {
  const html = renderScene({ id: "s1", component: "statement", props: { headline: "Hi" }, narration: "n" } as any, t);
  expect(html).toContain("Hi");
});

test("renderScene throws on unknown component", () => {
  expect(() => renderScene({ id: "s1", component: "nope", props: {}, narration: "n" } as any, t)).toThrow(/unknown component/i);
});

test("validateScenePlan throws with scene id on bad props", () => {
  const plan = { scenes: [{ id: "sX", component: "slack", props: {}, narration: "n" }] } as any;
  expect(() => validateScenePlan(plan)).toThrow(/sX/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/scenes/registry.test.ts`
Expected: FAIL — cannot find `./registry`.

- [ ] **Step 3: Write minimal implementation**

Create `src/scenes/registry.ts`:

```ts
import type { SceneComponent } from "./types";
import type { BrandTokens } from "../brand/token-resolver";
import type { SceneV2, VideoPlanV2 } from "../content-director/plan-schema";
import { intro } from "./intro";
import { slack } from "./slack";
import { statement } from "./statement";
import { gap } from "./gap";
import { flow } from "./flow";
import { capability } from "./capability";
import { bigstat } from "./bigstat";
import { cta } from "./cta";

export const SCENE_REGISTRY: Record<string, SceneComponent> = {
  intro, slack, statement, gap, flow, capability, bigstat, cta,
};

export function renderScene(scene: SceneV2, tokens: BrandTokens): string {
  const comp = SCENE_REGISTRY[scene.component];
  if (!comp) throw new Error(`Unknown component "${scene.component}" (scene ${scene.id})`);
  const props = comp.propsSchema.parse(scene.props);
  return comp.render(props, tokens);
}

export function validateScenePlan(plan: VideoPlanV2): void {
  for (const s of plan.scenes) {
    const comp = SCENE_REGISTRY[s.component];
    if (!comp) throw new Error(`Unknown component "${s.component}" (scene ${s.id})`);
    const r = comp.propsSchema.safeParse(s.props);
    if (!r.success) throw new Error(`Invalid props for scene ${s.id} (${s.component}): ${r.error.message}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/scenes/registry.test.ts`
Expected: PASS (4 pass).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/registry.ts src/scenes/registry.test.ts
git commit -m "feat: add scene registry with dispatch + plan validation"
```

---

## Task 9: Composition builder v2

**Files:**
- Create: `src/compose/build-composition-v2.ts`
- Test: `src/compose/build-composition-v2.test.ts`

**Interfaces:**
- Consumes: `VideoPlanV2` (with `duration` set on each scene), `renderScene` (registry), `BrandTokens`.
- Produces: `buildCompositionV2(plan: VideoPlanV2, tokens: BrandTokens, outDir: string, opts?: { audioRelPath?: string; captionHtml?: string }): { indexPath: string; totalDuration: number }`. Writes `index.html` + `meta.json`. Cumulative `data-start` from each scene's `duration`; each scene wrapped in `<div class="clip scene" data-start data-duration data-track-index="0" data-stagger data-ps data-py data-pe>`; paused GSAP timeline registered on `window.__timelines["feature-video"]` doing per-scene push-in + `.anim` stagger + caption cue reveals; the full scene CSS lives in the `<style>`.

- [ ] **Step 1: Write the failing test**

Create `src/compose/build-composition-v2.test.ts`:

```ts
import { test, expect } from "bun:test";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildCompositionV2 } from "./build-composition-v2";
import { loadBrandTokens } from "../brand/token-resolver";

const outDir = join(process.cwd(), "out/test-compose-v2");
const plan = {
  feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  scenes: [
    { id: "a", component: "statement", props: { headline: "First" }, narration: "n", duration: 4 },
    { id: "b", component: "cta", props: { headline: "Last" }, narration: "n", duration: 3 },
  ],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
} as any;

test("builds index.html with cumulative starts, clips, paused timeline", () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const { indexPath, totalDuration } = buildCompositionV2(plan, loadBrandTokens(), outDir, { audioRelPath: "audio/vo.wav" });
  const html = readFileSync(indexPath, "utf8");
  expect(totalDuration).toBe(7);
  expect(html).toContain('data-start="0.00"');
  expect(html).toContain('data-start="4.00"');
  expect(html).toContain('class="clip scene"');
  expect(html).toContain("gsap.timeline({ paused: true })");
  expect(html).toContain('window.__timelines["feature-video"]');
  expect(html).toContain("First");
  expect(html).toContain("Last");
  expect(existsSync(join(outDir, "meta.json"))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/compose/build-composition-v2.test.ts`
Expected: FAIL — cannot find `./build-composition-v2`.

- [ ] **Step 3: Write minimal implementation**

Create `src/compose/build-composition-v2.ts`. (The `<style>` and timeline JS are promoted verbatim from the working prototype `demo/build-video.ts`; the SCENES loop dispatches via `renderScene`.)

```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { VideoPlanV2 } from "../content-director/plan-schema";
import type { BrandTokens } from "../brand/token-resolver";
import { renderScene } from "../scenes/registry";

const PANEL = "#1e2c35", HAIR = "#33434d", MUTED = "#93a0a8", SUB = "#c4ccd2";
const GLOW = "radial-gradient(1150px 780px at 12% 6%, rgba(250,70,22,.10), transparent 58%),radial-gradient(1050px 720px at 90% 96%, rgba(11,162,179,.13), transparent 58%)";

export function buildCompositionV2(
  plan: VideoPlanV2, t: BrandTokens, outDir: string,
  opts: { audioRelPath?: string; captionHtml?: string } = {},
): { indexPath: string; totalDuration: number } {
  mkdirSync(join(outDir, "audio"), { recursive: true });
  const centered = new Set(["intro", "cta", "bigstat"]);
  const autoZoomDefault = new Set(["slack"]);

  let cursor = 0;
  const clips = plan.scenes.map((s) => {
    const dur = s.duration ?? 4;
    const start = cursor; cursor += dur;
    const m = s.motion ?? {};
    const ps = m.pushScale ?? (autoZoomDefault.has(s.component) ? 1.14 : 1.03);
    const py = m.pushY ?? (autoZoomDefault.has(s.component) ? -32 : 0);
    const pe = m.ease ?? (autoZoomDefault.has(s.component) ? "power2.inOut" : "none");
    const cls = "clip scene" + (centered.has(s.component) ? " center" : "");
    return `    <div class="${cls}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="0" data-stagger="${(m as any).stagger ?? 0.32}" data-ps="${ps}" data-py="${py}" data-pe="${pe}" style="background:${GLOW}, ${t.deepBlue}">
      <div class="inner">${renderScene(s, t)}</div>
    </div>`;
  }).join("\n");
  const totalDuration = cursor;

  const audioEl = opts.audioRelPath
    ? `    <audio id="vo" src="${opts.audioRelPath}" data-start="0" data-duration="${totalDuration.toFixed(2)}" data-track-index="1"></audio>` : "";

  const html = `<!doctype html>
<html lang="en" data-resolution="landscape"><head><meta charset="UTF-8" />
<title>${plan.feature_name}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
  html,body{margin:0;padding:0;width:1920px;height:1080px;overflow:hidden;background:${t.deepBlue};font-family:'Inter',sans-serif;color:${t.white};-webkit-font-smoothing:antialiased;}
  #master-root{width:1920px;height:1080px;position:relative;}
  .scene{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
  .inner{width:1520px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;transform-origin:center center;}
  .scene.center .inner{align-items:center;text-align:center;}
  .eyebrow{font-family:'Inter';font-weight:700;text-transform:uppercase;letter-spacing:.2em;font-size:24px;margin-bottom:28px;display:flex;align-items:center;gap:14px;}
  .eyebrow i{display:inline-block;width:34px;height:4px;border-radius:2px;background:${t.orange};}
  h1{font-family:'Poppins';font-weight:700;font-size:94px;line-height:1.04;letter-spacing:-0.045em;margin:0;}
  h2{font-family:'Poppins';font-weight:700;font-size:70px;line-height:1.05;letter-spacing:-0.04em;margin:0;}
  .sub{font-family:'Inter';font-weight:400;font-size:33px;line-height:1.42;color:${SUB};margin:34px 0 0;max-width:1240px;}
  .logo{height:120px;width:auto;align-self:flex-start;flex:0 0 auto;}.scene.center .logo{align-self:center;}.logo.big{height:180px;}
  .introtag{font-family:'Poppins';font-weight:600;font-size:46px;letter-spacing:-0.02em;color:${SUB};margin-top:34px;}
  .bigstat-num{font-family:'Poppins';font-weight:900;font-size:220px;line-height:1;letter-spacing:-0.04em;}
  .bigstat-unit{font-size:120px;margin-left:10px;}
  .footer{position:absolute;left:64px;bottom:48px;font-family:'Inter';font-weight:600;font-size:22px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.28);display:flex;gap:12px;}
  .footer b{color:rgba(255,255,255,.5);font-weight:700;}
  .slackwin{width:1240px;height:660px;display:flex;border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 50px 110px rgba(0,0,0,.55);border:1px solid rgba(0,0,0,.1);}
  .slack-sb{width:290px;background:#3F0E40;color:#fff;padding:22px 0;flex:0 0 auto;}
  .sb-ws{font-family:'Poppins';font-weight:700;font-size:27px;padding:4px 22px 20px;border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:16px;display:flex;gap:8px;}
  .sb-caret{font-size:18px;opacity:.7;}.sb-sec{color:rgba(255,255,255,.6);font-size:19px;font-weight:600;padding:0 22px 8px;}
  .sb-ch{font-size:23px;color:rgba(255,255,255,.72);padding:9px 22px;display:flex;gap:8px;}.sb-hash{opacity:.55;}
  .sb-ch.active{background:#1164A3;color:#fff;font-weight:600;}
  .slack-main{flex:1;display:flex;flex-direction:column;background:#fff;}
  .slack-hd{padding:20px 30px;border-bottom:1px solid #e2e2e2;display:flex;align-items:baseline;}
  .hd-ch{font-family:'Poppins';font-weight:700;font-size:28px;color:#1d1c1d;}.hd-meta{font-size:20px;color:#616061;}
  .slack-body{flex:1;padding:20px 30px;display:flex;flex-direction:column;gap:22px;}
  .srow{display:flex;gap:18px;align-items:flex-start;}
  .savatar{flex:0 0 46px;width:46px;height:46px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-family:'Poppins';font-weight:700;font-size:19px;color:#fff;}
  .scol{display:flex;flex-direction:column;gap:3px;}.shead{display:flex;align-items:baseline;gap:12px;}
  .sname{font-family:'Poppins';font-weight:700;font-size:25px;color:#1d1c1d;}.stime{font-size:18px;color:#616061;}
  .stext{font-size:26px;line-height:1.34;color:#1d1c1d;}.stext b{font-weight:700;}
  .slack-compose{margin:0 30px 26px;border:1px solid #b9b9b9;border-radius:12px;padding:18px 22px;color:#8d8d8d;font-size:23px;}
  .gapviz{display:flex;align-items:stretch;width:100%;}
  .shore{flex:1;background:${PANEL};border:2px solid ${HAIR};border-top-width:5px;border-radius:18px;padding:40px 40px 44px;text-align:left;}
  .shore-icon{width:74px;height:74px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:700;margin-bottom:26px;}
  .shore-t{font-family:'Poppins';font-weight:700;font-size:42px;margin-bottom:12px;}.shore-s{font-size:28px;color:${SUB};line-height:1.4;}
  .chasm{flex:0 0 340px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;}
  .chasm-line{width:100%;height:0;border-top:4px dashed ${MUTED};opacity:.5;}
  .chasm-dot{width:16px;height:16px;border-radius:50%;position:absolute;top:calc(50% - 8px);left:calc(50% - 8px);box-shadow:0 0 24px 6px rgba(250,70,22,.5);}
  .chasm-lbl{position:absolute;top:calc(50% + 24px);left:50%;transform:translateX(-50%);width:250px;text-align:center;font-size:19px;line-height:1.35;color:${MUTED};text-transform:uppercase;letter-spacing:.07em;}
  .flow{display:flex;align-items:center;flex-wrap:wrap;gap:20px;margin-top:14px;}
  .node{background:${PANEL};border:2px solid ${HAIR};border-radius:16px;padding:26px 30px;font-family:'Poppins';font-weight:600;font-size:32px;color:#eef2f4;white-space:nowrap;display:flex;align-items:center;gap:14px;}
  .node-ic{font-size:34px;}.arrow{font-size:42px;color:${MUTED};}
  .caps{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:28px;width:100%;}
  .caps li{display:flex;gap:26px;align-items:center;font-size:37px;}
  .capic{flex:0 0 76px;width:76px;height:76px;border-radius:16px;background:${PANEL};border:1px solid ${HAIR};display:flex;align-items:center;justify-content:center;font-size:38px;}
  .caps b{font-family:'Poppins';font-weight:600;display:block;}.capd{display:block;font-size:27px;color:#aab4bb;margin-top:5px;}
  .ctacard{background:#fff;border-radius:26px;padding:52px 68px;box-shadow:0 34px 90px rgba(0,0,0,.45);}.ctacard .logo{height:92px;align-self:center;}
  .cap{position:absolute;left:50%;bottom:70px;transform:translateX(-50%);width:1200px;text-align:center;font-family:'Inter';font-weight:600;font-size:37px;line-height:1.3;text-shadow:0 2px 22px rgba(0,0,0,.75);pointer-events:none;z-index:50;}
  .capw{color:rgba(255,255,255,.4);}
</style></head>
<body>
  <div id="master-root" data-composition-id="feature-video" data-start="0" data-width="1920" data-height="1080">
${clips}
${opts.captionHtml ?? ""}
    <div class="footer"><b>UiPath</b> · Enablement</div>
${audioEl}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    document.querySelectorAll('.scene').forEach((scene) => {
      const start = parseFloat(scene.dataset.start);
      const dur = parseFloat(scene.dataset.duration);
      const stagger = parseFloat(scene.dataset.stagger) || 0.14;
      const inner = scene.querySelector('.inner');
      tl.fromTo(inner, { scale: 1, y: 0 }, { scale: parseFloat(scene.dataset.ps), y: parseFloat(scene.dataset.py), duration: dur, ease: scene.dataset.pe || 'none' }, start);
      const kids = scene.querySelectorAll('.anim');
      if (kids.length) tl.from(kids, { autoAlpha: 0, y: 44, duration: 0.6, stagger: stagger, ease: 'back.out(1.6)' }, start + 0.28);
    });
    document.querySelectorAll('.cap').forEach((cap) => {
      const s = parseFloat(cap.dataset.s), e = parseFloat(cap.dataset.e);
      tl.fromTo(cap, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.22, ease: 'power2.out' }, Math.max(0, s - 0.08));
      tl.to(cap, { autoAlpha: 0, duration: 0.2, ease: 'power1.in' }, e + 0.18);
      cap.querySelectorAll('.capw').forEach((w) => { tl.to(w, { color: '#ffffff', duration: 0.12 }, parseFloat(w.dataset.t)); });
    });
    window.__timelines["feature-video"] = tl;
  </script>
</body></html>`;

  const indexPath = join(outDir, "index.html");
  writeFileSync(indexPath, html);
  writeFileSync(join(outDir, "meta.json"), JSON.stringify({ id: "feature-video", name: plan.feature_name, duration: totalDuration, width: 1920, height: 1080, fps: 30 }, null, 2));
  return { indexPath, totalDuration };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/compose/build-composition-v2.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add src/compose/build-composition-v2.ts src/compose/build-composition-v2.test.ts
git commit -m "feat: add composition builder v2 (registry dispatch + motion + captions)"
```

---

## Task 10: Orchestrator + integration

**Files:**
- Create: `src/pipeline/build-plan.ts`, `fixtures/sample-plan.v2.json`
- Test: `src/pipeline/build-plan.test.ts`

**Interfaces:**
- Consumes: `validatePlanV2`, `validateScenePlan`, `loadBrandTokens`, `synthesizePlanAudio`, `saySynthesizer`, `buildCompositionV2`, `render`.
- Produces: `buildFromPlan(planPath: string, outDir: string): Promise<string>` (returns rendered mp4 path); `pickSynthesizer()` (returns an Ava-Premium synthesizer if that voice is installed, else `saySynthesizer`).

- [ ] **Step 1: Write the failing test**

Create `src/pipeline/build-plan.test.ts`:

```ts
import { test, expect } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildFromPlan } from "./build-plan";

const outDir = join(process.cwd(), "out/e2e-v2");

// Integration: needs say, ffmpeg, Node 22+ (HYPERFRAMES_NODE_BIN), Chrome. Slow (~1-2 min).
test("enriched plan -> narrated branded mp4 with video + audio", async () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const mp4 = await buildFromPlan(join(process.cwd(), "fixtures/sample-plan.v2.json"), outDir);
  expect(existsSync(mp4)).toBe(true);
  const streams = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1", mp4]).toString();
  expect(streams).toContain("video");
  expect(streams).toContain("audio");
}, 180000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/pipeline/build-plan.test.ts`
Expected: FAIL — cannot find `./build-plan`.

- [ ] **Step 3: Write minimal implementation**

Create `fixtures/sample-plan.v2.json`:

```json
{
  "feature_name": "Agentic Document Understanding",
  "value_prop": "Extract data from any document with self-correcting agents.",
  "persona": "Account Executive", "when_to_use": "When extraction keeps breaking.",
  "talking_points": ["Handles unseen layouts", "Self-corrects low-confidence fields"],
  "scenes": [
    { "id": "s1", "component": "intro", "props": { "tagline": "Enablement. Automatically." }, "narration": "UiPath enablement." },
    { "id": "s2", "component": "slack", "props": { "channel": "sales-help", "members": 12, "messages": [
      { "color": "#E01E5A", "initials": "PS", "name": "Priya", "time": "9:41 AM", "text": "we shipped a new feature?? 😅" },
      { "color": "#2EB67D", "initials": "MA", "name": "Marco", "time": "9:42 AM", "text": "a customer asked and I had <b>nothing</b>" }
    ] }, "narration": "Engineering ships something great, and the questions pour in." },
    { "id": "s3", "component": "statement", "props": { "eyebrow": "The insight", "headline": "Merge is maximum context.", "highlight": "maximum context", "sub": "Capture it before it evaporates." }, "narration": "Merge is the moment of maximum context." },
    { "id": "s4", "component": "cta", "props": { "headline": "From merge to enablement." }, "narration": "From merge to enablement, automatically." }
  ],
  "youtube_metadata": { "title": "ADU Enablement", "description": "d", "tags": ["uipath"], "chapters": [] }
}
```

Create `src/pipeline/build-plan.ts`:

```ts
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { validatePlanV2 } from "../content-director/plan-schema";
import { validateScenePlan } from "../scenes/registry";
import { loadBrandTokens } from "../brand/token-resolver";
import { synthesizePlanAudio } from "../audio/assemble-audio";
import { saySynthesizer, type SpeechSynthesizer } from "../audio/tts";
import { buildCompositionV2 } from "../compose/build-composition-v2";
import { render } from "../render/render";

export function pickSynthesizer(): SpeechSynthesizer {
  try {
    const voices = execFileSync("say", ["-v", "?"]).toString();
    if (voices.includes("Ava (Premium)")) {
      return {
        synthesize(text, outWavPath) {
          const aiff = outWavPath.replace(/\.wav$/, ".aiff");
          execFileSync("say", ["-v", "Ava (Premium)", "-o", aiff, text]);
          execFileSync("ffmpeg", ["-y", "-i", aiff, "-ar", "44100", "-ac", "2", outWavPath], { stdio: "ignore" });
        },
      };
    }
  } catch { /* fall through */ }
  return saySynthesizer;
}

type Word = { text: string; start: number; end: number };

export async function buildFromPlan(planPath: string, outDir: string): Promise<string> {
  const plan = validatePlanV2(JSON.parse(readFileSync(planPath, "utf8")));
  validateScenePlan(plan);
  const tokens = loadBrandTokens();
  mkdirSync(join(outDir, "audio"), { recursive: true });
  mkdirSync(join(outDir, "renders"), { recursive: true });

  const { planWithTiming } = synthesizePlanAudio(plan as any, pickSynthesizer(), join(outDir, "audio"), 0.9);
  execFileSync("ffmpeg", ["-y", "-i", join(outDir, "audio/vo.wav"), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", join(outDir, "audio/vo-norm.wav")], { stdio: "ignore" });

  // captions (optional — skip if transcribe unavailable)
  let captionHtml = "";
  try {
    const nodeBin = process.env.HYPERFRAMES_NODE_BIN;
    const hfEnv = nodeBin ? { ...process.env, PATH: `${nodeBin}:${process.env.PATH}` } : process.env;
    execFileSync("npx", ["-y", "hyperframes@latest", "transcribe", "audio/vo-norm.wav", "--json", "--optional"], { cwd: outDir, env: hfEnv, stdio: "ignore" });
    const words = JSON.parse(readFileSync(join(outDir, "audio/transcript.json"), "utf8")) as Word[];
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const cues: { words: Word[]; start: number; end: number }[] = [];
    let cur: Word[] = [], len = 0;
    const flush = () => { if (cur.length) { cues.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; } };
    for (const w of words) { cur.push(w); len += w.text.length + 1; if (len >= 42 || cur.length >= 8 || /[.?!]$/.test(w.text.trim())) { flush(); len = 0; } }
    flush();
    captionHtml = cues.map((c) => `    <div class="cap" data-s="${c.start}" data-e="${c.end}">${c.words.map((w) => `<span class="capw" data-t="${w.start}">${esc(w.text)}</span>`).join(" ")}</div>`).join("\n");
  } catch { captionHtml = ""; }

  buildCompositionV2(planWithTiming as any, tokens, outDir, { audioRelPath: "audio/vo-norm.wav", captionHtml });
  render(outDir, "renders/video.mp4");
  return join(outDir, "renders", "video.mp4");
}

if (import.meta.main) {
  const planPath = process.argv[2] || "fixtures/sample-plan.v2.json";
  buildFromPlan(planPath, join(process.cwd(), "out/latest-v2")).then((p) => console.log("Rendered:", p));
}
```

Also copy the logo into the fixture output assets at build time — add near the top of `buildFromPlan`, after the `mkdirSync` calls:

```ts
  mkdirSync(join(outDir, "assets"), { recursive: true });
  execFileSync("cp", [join(process.cwd(), "brand/logos/uipath-logo-orange.png"), join(outDir, "assets/uipath-logo-orange.png")]);
```

- [ ] **Step 4: Run test to verify it passes**

Set env first:
```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use stable
export HYPERFRAMES_NODE_BIN="$(dirname "$(nvm which stable)")"
```
Run: `bun test src/pipeline/build-plan.test.ts`
Expected: PASS (1 pass) — `out/e2e-v2/renders/video.mp4` with video + audio streams.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/build-plan.ts src/pipeline/build-plan.test.ts fixtures/sample-plan.v2.json
git commit -m "feat: add v2 orchestrator (plan.json -> narrated video) + fixture"
```

---

## Task 11: Director skill

**Files:**
- Create: `.claude/skills/enablement-video/SKILL.md`
- Test: (validation) `src/scenes/skill-fixture.test.ts`

**Interfaces:**
- Consumes: the component registry vocabulary; `validatePlanV2` + `validateScenePlan`.
- Produces: `SKILL.md` (the director). The test asserts the shipped `fixtures/sample-plan.v2.json` (representing director output) passes both `validatePlanV2` and `validateScenePlan` — guaranteeing the documented contract is real.

- [ ] **Step 1: Write the failing test**

Create `src/scenes/skill-fixture.test.ts`:

```ts
import { test, expect } from "bun:test";
import { validatePlanV2 } from "../content-director/plan-schema";
import { validateScenePlan } from "./registry";
import sample from "../../fixtures/sample-plan.v2.json";

test("director output fixture validates against schema + registry", () => {
  const plan = validatePlanV2(sample);
  expect(() => validateScenePlan(plan)).not.toThrow();
  expect(plan.scenes.length).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/scenes/skill-fixture.test.ts`
Expected: FAIL only if the fixture is invalid; if Task 10's fixture is valid this passes immediately — in that case still create SKILL.md (Step 3) so the deliverable exists, then proceed.

- [ ] **Step 3: Write the skill**

Create `.claude/skills/enablement-video/SKILL.md`:

```markdown
---
name: enablement-video
description: Turn a prompt, PR, or Jira ticket into a premium, on-brand UiPath enablement video by authoring an enriched VideoPlan v2 and rendering it. Use when asked to "make an enablement video", "turn this feature/PR into a video", or "create a demo video".
---

# Enablement Video Director

You are the creative + content director for UiPath feature-enablement videos. Given a
prompt / PR / Jira ticket, design an adaptive video and author `plan.v2.json`, then render it.

## Steps
1. Understand the feature from the source. Ground everything in it — NEVER invent a benefit,
   metric, or capability the source doesn't support (for a prompt, the text is the only evidence).
2. Design an adaptive scene sequence (any order/count) that still tells a sales story: hook the
   customer problem, name the capability + value, show/illustrate it, give the positioning /
   when-to-use, end on a CTA. Choose freely from the component vocabulary below.
3. Write `plan.v2.json` conforming to VideoPlan v2 (`src/content-director/plan-schema.ts`):
   each scene is `{ id, component, props, narration }`. Narration drives duration — keep each
   scene's narration to 1-3 spoken sentences.
4. Render: `export HYPERFRAMES_NODE_BIN="$(dirname "$(nvm which stable)")"` then
   `bun run src/pipeline/build-plan.ts plan.v2.json`.
5. Review the output frames; adjust props/narration and re-render if needed.

## Component vocabulary (each with required props — see registry)
- `intro` {tagline} — logo sting open.
- `slack` {channel, members, messages[]{color,initials,name,time,text}} — a customer/sales-pain
  conversation. Great for the hook. Message `text` may include `<b>`.
- `statement` {eyebrow?, headline, highlight?, sub?} — a key line / insight / capability name.
- `gap` {eyebrow, headline, left{icon,title,sub}, right{icon,title,sub}, chasmLabel} — a
  two-sides-with-a-gap metaphor (e.g. engineering vs sales).
- `flow` {eyebrow, nodes[]{icon,label}} — a process/pipeline/architecture sequence.
- `capability` {eyebrow, items[]{icon,title,desc}} — a checklist of technical capabilities.
- `bigstat` {eyebrow, number, unit?, caption} — one hero number (e.g. "10×", "weeks → minutes").
- `cta` {headline} — closing call to action.

## Rules
- Output MUST validate: every `component` is from the vocabulary and its `props` are complete.
- Use Slack-palette avatar colors (#E01E5A, #2EB67D, #36C5F0, #ECB22E) for realism.
- Motion, kinetic captions, and the premium voice are applied automatically by the builder —
  don't hand-build them.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/scenes/skill-fixture.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/enablement-video/SKILL.md src/scenes/skill-fixture.test.ts
git commit -m "feat: add enablement-video director skill"
```

---

## Self-Review

**Spec coverage:**
- §4 enriched VideoPlan v2 → Task 1 ✅
- §5 scene-component library (8 components + registry) → Tasks 2–8 ✅
- §6 director skill + run flow → Task 11 + orchestrator Task 10 ✅
- §7 motion/captions/voice defaults + validation gate → builder Task 9 + registry Task 8 + orchestrator Task 10 ✅
- §9 testing (unit per component, registry, schema; integration fixture → mp4) → each task's test + Task 10 ✅
- Deferred per §11 (own follow-ons): real demo capture, SFX/music, runtime LLM-API, PR/Jira adapters.

**Placeholder scan:** no TBD/TODO; every code step has complete code; the big CSS/timeline is provided in full in Task 9 (promoted from the working prototype).

**Type consistency:** `SceneComponent` (Task 2) used by all components (3–7) and registry (8); `renderScene`/`validateScenePlan`/`SCENE_REGISTRY` (Task 8) used by builder (9) + orchestrator (10); `VideoPlanV2`/`SceneV2`/`validatePlanV2` (Task 1) used by 8/9/10/11; `buildCompositionV2` (9) used by 10; `pickSynthesizer`/`buildFromPlan` (10) used by the skill (11). Component `render(props, tokens)` signature and shared CSS class names are consistent across components and the builder's `<style>`.

## Follow-on (not this milestone)
Real Playwright demo capture + ROI camera director; SFX/music bed; runtime LLM-API director adapter; PR/Jira ingest adapters feeding `SourceContext` to the skill.
