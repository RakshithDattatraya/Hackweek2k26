# PR-Aware Footage Ingest + Segment-Concat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the pipeline PR-aware: derive feature context from the git branch, detect a demo video in the changed files, and — when present — reuse that clip as the demo beat wrapped in a full generated enablement video via ffmpeg segment-concat. No video → today's pipeline, unchanged.

**Architecture:** New `renderSegment` (VO-only, reuses existing primitives; `buildFromPlan` untouched) + clip normalization + video/audio concat + a footage-aware orchestrator (`build-from-branch.ts`). Music/SFX applied once over the concatenated whole via the existing `mixFinalAudio`.

**Tech Stack:** TypeScript, bun, ffmpeg/ffprobe, git. No new npm deps.

## Global Constraints

- No new npm dependencies. bun runtime; `execFileSync` from `node:child_process`.
- The existing no-footage path (`buildFromPlan`) must stay behavior-preserving — do NOT modify it; add new modules.
- Ground demo-beat narration in the plan (author-provided), no invented claims.
- All generated segments 1920×1080 / 30fps / yuv420p / 48kHz stereo audio so concat is uniform.
- Captions on the footage path are OUT OF SCOPE for v1 (documented); the no-footage path keeps captions.

---

### Task 1: PR/branch ingest (`src/ingest/pr-context.ts`)

**Files:** Create `src/ingest/pr-context.ts`; Test `src/ingest/pr-context.test.ts`

**Interfaces:**
- `type PrContext = { branch: string; headSha: string; commits: string[]; diffFiles: string[]; diff: string; title: string; body: string }`
- `getPrContext(repoRoot?: string, baseBranch?: string): PrContext`
- `detectDemoVideo(diffFiles: string[], repoRoot?: string): string | null`

- [ ] **Step 1: Write the failing test** — `src/ingest/pr-context.test.ts`:

```ts
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPrContext, detectDemoVideo } from "./pr-context";

test("detectDemoVideo finds a committed video, else null", () => {
  const dir = join(process.cwd(), "out/test-prctx-v"); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "demo.mp4"), "x");
  expect(detectDemoVideo(["src/a.ts", "demo.mp4"], dir)).toBe(join(dir, "demo.mp4"));
  expect(detectDemoVideo(["src/a.ts", "README.md"], dir)).toBeNull();
  expect(detectDemoVideo(["ghost.mp4"], dir)).toBeNull(); // not on disk
  rmSync(dir, { recursive: true, force: true });
});

test("getPrContext reads branch + commit subjects from git", () => {
  const dir = join(process.cwd(), "out/test-prctx-g"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const g = (args: string[]) => execFileSync("git", args, { cwd: dir });
  g(["init", "-q"]); g(["config", "user.email", "t@t"]); g(["config", "user.name", "t"]);
  g(["checkout", "-q", "-b", "feature-x"]);
  writeFileSync(join(dir, "a.txt"), "hi"); g(["add", "."]); g(["commit", "-q", "-m", "feat: add thing"]);
  const ctx = getPrContext(dir, "main");
  expect(ctx.branch).toBe("feature-x");
  expect(ctx.headSha.length).toBeGreaterThan(6);
  expect(ctx.commits[0]).toContain("feat: add thing");
  expect(ctx.title).toContain("feat: add thing");
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test src/ingest/pr-context.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/ingest/pr-context.ts`:

```ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type PrContext = {
  branch: string; headSha: string; commits: string[];
  diffFiles: string[]; diff: string; title: string; body: string;
};

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd }).toString();
}

/** Derive feature ("PR") context from the current branch: commit subjects + diff vs baseBranch. */
export function getPrContext(repoRoot: string = process.cwd(), baseBranch = "main"): PrContext {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot).trim();
  const headSha = git(["rev-parse", "HEAD"], repoRoot).trim();

  let logOut = "";
  try { logOut = git(["log", "--format=%s%n%b%x00", `${baseBranch}..HEAD`], repoRoot); }
  catch { logOut = git(["log", "-20", "--format=%s%n%b%x00"], repoRoot); }
  const blocks = logOut.split("\0").map((s) => s.trim()).filter(Boolean);
  const commits = blocks.map((b) => b.split("\n")[0]);
  const title = commits[0] ?? branch;
  const body = blocks.join("\n\n");

  let diffFiles: string[] = [], diff = "";
  try {
    diffFiles = git(["diff", "--name-only", `${baseBranch}...HEAD`], repoRoot).split("\n").map((s) => s.trim()).filter(Boolean);
    diff = git(["diff", `${baseBranch}...HEAD`], repoRoot);
  } catch { /* base missing → leave empty */ }

  return { branch, headSha, commits, diffFiles, diff, title, body };
}

const VIDEO_RE = /\.(mp4|mov|webm|m4v)$/i;

/** First changed file that is a video and exists on disk (absolute path), else null. */
export function detectDemoVideo(diffFiles: string[], repoRoot: string = process.cwd()): string | null {
  for (const f of diffFiles) {
    if (VIDEO_RE.test(f)) {
      const abs = join(repoRoot, f);
      if (existsSync(abs)) return abs;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run to verify pass** — `bun test src/ingest/pr-context.test.ts` → PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/ingest/pr-context.ts src/ingest/pr-context.test.ts
git commit -m "feat: PR/branch context ingest + demo-video detection (git-based)"
```

---

### Task 2: Footage scene in the plan schema (`src/content-director/plan-schema.ts`)

**Files:** Modify `src/content-director/plan-schema.ts`; Test `src/content-director/footage-scene.test.ts`

**Interfaces:**
- `FootageSceneSchema`, `type FootageScene`, `isFootageScene(s): s is FootageScene`
- `VideoPlanV3Schema.scenes` union extended to include footage scenes.

- [ ] **Step 1: Write the failing test** — `src/content-director/footage-scene.test.ts`:

```ts
import { test, expect } from "bun:test";
import { validatePlanV3, isFootageScene, isCustomScene } from "./plan-schema";

const base = {
  feature_name: "F", value_prop: "v", persona: "p", when_to_use: "w", talking_points: ["t"],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
};

test("a footage scene parses and is detected by isFootageScene", () => {
  const plan = validatePlanV3({ ...base, scenes: [
    { id: "hook", html: "<div>x</div>", narration: "hi" },
    { id: "demo", footage: { narration: "Here's the feature in action." } },
  ]});
  expect(plan.scenes.length).toBe(2);
  const demo = plan.scenes[1] as any;
  expect(isFootageScene(demo)).toBe(true);
  expect(isCustomScene(demo)).toBe(false);
  expect(demo.footage.narration).toContain("action");
});

test("footage scene accepts optional clipPath", () => {
  const plan = validatePlanV3({ ...base, scenes: [
    { id: "demo", footage: { narration: "n", clipPath: "/tmp/x.mp4" } },
  ]});
  expect((plan.scenes[0] as any).footage.clipPath).toBe("/tmp/x.mp4");
});
```

- [ ] **Step 2: Run to verify fail** — `bun test src/content-director/footage-scene.test.ts` → FAIL (isFootageScene not exported / footage scene rejected by union).

- [ ] **Step 3: Implement.** In `src/content-director/plan-schema.ts`, ADD (after `CustomSceneSchema`):

```ts
export const FootageSceneSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, "id must be alphanumeric, underscore, or hyphen"),
  footage: z.object({ narration: z.string().min(1), clipPath: z.string().optional() }),
  duration: z.number().positive().optional(),
  transitionOut: z.string().optional(),
  transitionOverlap: z.number().nonnegative().optional(),
});
export type FootageScene = z.infer<typeof FootageSceneSchema>;

export function isFootageScene(s: unknown): s is FootageScene {
  return typeof s === "object" && s !== null && "footage" in s;
}
```

Then extend the V3 scenes union — change:
```ts
  scenes: z.array(z.union([SceneV2Schema, CustomSceneSchema])).min(1),
```
to:
```ts
  scenes: z.array(z.union([FootageSceneSchema, CustomSceneSchema, SceneV2Schema])).min(1),
```
(FootageScene first so `{footage}` objects match it, not the component schema.)

- [ ] **Step 4: Run to verify pass** — `bun test src/content-director/footage-scene.test.ts` → PASS. Also run `bun test src/content-director/` to confirm no schema regression.

- [ ] **Step 5: Commit**
```bash
git add src/content-director/plan-schema.ts src/content-director/footage-scene.test.ts
git commit -m "feat: footage scene type in V3 plan schema + isFootageScene guard"
```

---

### Task 3: Clip normalization (`src/footage/normalize.ts`)

**Files:** Create `src/footage/normalize.ts`; Test `src/footage/normalize.test.ts`

**Interfaces:** `normalizeClip(inPath, outPath, opts?: { width?: number; height?: number; fps?: number }): { duration: number }`

- [ ] **Step 1: Write the failing test** — `src/footage/normalize.test.ts`:

```ts
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { normalizeClip } from "./normalize";

function probe(path: string, entry: string): string {
  return execFileSync("ffprobe", ["-v","error","-select_streams","v:0","-show_entries",entry,"-of","default=noprint_wrappers=1:nokey=1", path]).toString().trim();
}

test("normalizeClip pads to 1920x1080/30 and drops audio", () => {
  const dir = join(process.cwd(), "out/test-normalize"); mkdirSync(dir, { recursive: true });
  const src = join(dir, "s.mp4"), out = join(dir, "o.mp4");
  execFileSync("ffmpeg", ["-y","-f","lavfi","-i","testsrc=size=640x360:rate=15","-t","2","-pix_fmt","yuv420p", src], { stdio: "ignore" });
  const { duration } = normalizeClip(src, out);
  expect(probe(out, "stream=width")).toBe("1920");
  expect(probe(out, "stream=height")).toBe("1080");
  expect(Math.abs(duration - 2)).toBeLessThan(0.3);
  const hasAudio = execFileSync("ffprobe", ["-v","error","-select_streams","a","-show_entries","stream=codec_type","-of","default=noprint_wrappers=1:nokey=1", out]).toString().trim();
  expect(hasAudio).toBe(""); // video-only
  rmSync(dir, { recursive: true, force: true });
}, 30000);
```

- [ ] **Step 2: Run to verify fail** — `bun test src/footage/normalize.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/footage/normalize.ts`:

```ts
import { execFileSync } from "node:child_process";

/** Normalize any clip to WxH/fps/yuv420p, letterboxed, video-only (audio dropped). Returns duration (s). */
export function normalizeClip(
  inPath: string, outPath: string,
  opts: { width?: number; height?: number; fps?: number } = {},
): { duration: number } {
  const w = opts.width ?? 1920, h = opts.height ?? 1080, fps = opts.fps ?? 30;
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps},setsar=1,format=yuv420p`;
  execFileSync("ffmpeg", ["-y", "-i", inPath, "-vf", vf, "-an", "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", String(fps), outPath], { stdio: "ignore" });
  const duration = parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", outPath]).toString().trim());
  return { duration };
}
```

- [ ] **Step 4: Run to verify pass** — `bun test src/footage/normalize.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/footage/normalize.ts src/footage/normalize.test.ts
git commit -m "feat: demo-clip normalization to 1920x1080/30 video-only"
```

---

### Task 4: VO-only segment renderer (`src/pipeline/render-segment.ts`)

**Files:** Create `src/pipeline/render-segment.ts`; Test `src/pipeline/render-segment.test.ts`

**Interfaces:** `renderSegment(scenes: any[], outDir: string): { videoPath: string; voPath: string; duration: number }`
- Consumes: `synthesizePlanAudio`, `buildCompositionV2`, `render`, `loadBrandTokens`, `pickSynthesizer` (from `./build-plan`), `validateScenePlan`, `isCustomScene`, `isFootageScene`.
- Renders a subset of scenes to an mp4 whose audio is VO-only (no music/SFX/captions). `buildFromPlan` is NOT touched.

- [ ] **Step 1: Write the failing test** — `src/pipeline/render-segment.test.ts`:

```ts
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { renderSegment } from "./render-segment";

test("renderSegment renders a subset of scenes to an mp4 with VO audio", () => {
  const dir = join(process.cwd(), "out/test-segment"); rmSync(dir, { recursive: true, force: true });
  const scenes = [
    { id: "a", html: "<div style='color:var(--uip-white)'>Alpha</div>", narration: "Alpha beat." },
    { id: "b", html: "<div style='color:var(--uip-white)'>Beta</div>", narration: "Beta beat." },
  ];
  const r = renderSegment(scenes as any, dir);
  expect(existsSync(r.videoPath)).toBe(true);
  expect(existsSync(r.voPath)).toBe(true);
  expect(r.duration).toBeGreaterThan(0);
  const hasAudio = execFileSync("ffprobe", ["-v","error","-select_streams","a","-show_entries","stream=codec_type","-of","default=noprint_wrappers=1:nokey=1", r.videoPath]).toString().trim();
  expect(hasAudio).toBe("audio");
  rmSync(dir, { recursive: true, force: true });
}, 180000);
```

- [ ] **Step 2: Run to verify fail** — `bun test src/pipeline/render-segment.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/pipeline/render-segment.ts`:

```ts
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { validateScenePlan } from "../scenes/registry";
import { isCustomScene, isFootageScene } from "../content-director/plan-schema";
import { synthesizePlanAudio } from "../audio/assemble-audio";
import { buildCompositionV2 } from "../compose/build-composition-v2";
import { render } from "../render/render";
import { loadBrandTokens } from "../brand/token-resolver";
import { pickSynthesizer } from "./build-plan";

/** Render a subset of scenes to an mp4 with VO-only audio (no music/SFX/captions). */
export function renderSegment(scenes: any[], outDir: string): { videoPath: string; voPath: string; duration: number } {
  const tokens = loadBrandTokens();
  // Validate only registry-component scenes (custom + footage handled elsewhere / excluded).
  validateScenePlan({ scenes: scenes.filter((s: any) => !isCustomScene(s) && !isFootageScene(s)) } as any);

  mkdirSync(join(outDir, "audio"), { recursive: true });
  mkdirSync(join(outDir, "renders"), { recursive: true });
  mkdirSync(join(outDir, "assets"), { recursive: true });
  execFileSync("cp", [join(process.cwd(), "brand/logos/uipath-logo-orange.png"), join(outDir, "assets/uipath-logo-orange.png")]);

  const plan = {
    feature_name: "segment", value_prop: "", persona: "", when_to_use: "",
    talking_points: ["x"], scenes,
    youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
  };
  const { planWithTiming } = synthesizePlanAudio(plan as any, pickSynthesizer(), join(outDir, "audio"), 0.9);
  execFileSync("ffmpeg", ["-y", "-i", join(outDir, "audio/vo.wav"), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", join(outDir, "audio/vo-norm.wav")], { stdio: "ignore" });

  buildCompositionV2(planWithTiming as any, tokens, outDir, { audioRelPath: "audio/vo-norm.wav", captionHtml: "" });
  render(outDir, "renders/video.mp4");

  const duration = (planWithTiming.scenes as any[]).reduce((a, s) => a + (s.duration ?? 4), 0);
  return { videoPath: join(outDir, "renders/video.mp4"), voPath: join(outDir, "audio/vo-norm.wav"), duration };
}
```

- [ ] **Step 4: Run to verify pass** — `bun test src/pipeline/render-segment.test.ts` → PASS. (Needs HYPERFRAMES_NODE_BIN + nvm env like other render tests; run with the standard env exports.)

- [ ] **Step 5: Commit**
```bash
git add src/pipeline/render-segment.ts src/pipeline/render-segment.test.ts
git commit -m "feat: VO-only segment renderer (reuses primitives; buildFromPlan untouched)"
```

---

### Task 5: Video + audio concat (`src/compose/concat-segments.ts`)

**Files:** Create `src/compose/concat-segments.ts`; Test `src/compose/concat-segments.test.ts`

**Interfaces:** `concatVideos(videoPaths: string[], outPath: string): void`, `concatAudios(wavPaths: string[], outPath: string): void`

- [ ] **Step 1: Write the failing test** — `src/compose/concat-segments.test.ts`:

```ts
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { concatVideos, concatAudios } from "./concat-segments";

function dur(p: string): number {
  return parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", p]).toString().trim());
}

test("concatVideos joins uniform clips (video-only) to summed duration", () => {
  const dir = join(process.cwd(), "out/test-concat-v"); mkdirSync(dir, { recursive: true });
  const mk = (name: string, secs: number) => { const p = join(dir, name); execFileSync("ffmpeg", ["-y","-f","lavfi","-i",`testsrc=size=1920x1080:rate=30`,"-t",String(secs),"-pix_fmt","yuv420p", p], { stdio: "ignore" }); return p; };
  const a = mk("a.mp4", 1), b = mk("b.mp4", 1), c = mk("c.mp4", 1);
  const out = join(dir, "out.mp4");
  concatVideos([a, b, c], out);
  expect(Math.abs(dur(out) - 3)).toBeLessThan(0.4);
  rmSync(dir, { recursive: true, force: true });
}, 60000);

test("concatAudios joins wavs to summed duration", () => {
  const dir = join(process.cwd(), "out/test-concat-a"); mkdirSync(dir, { recursive: true });
  const mk = (name: string, secs: number) => { const p = join(dir, name); execFileSync("ffmpeg", ["-y","-f","lavfi","-i",`sine=frequency=200:duration=${secs}`,"-ar","48000","-ac","2", p], { stdio: "ignore" }); return p; };
  const a = mk("a.wav", 1), b = mk("b.wav", 2);
  const out = join(dir, "out.wav");
  concatAudios([a, b], out);
  expect(Math.abs(dur(out) - 3)).toBeLessThan(0.3);
  rmSync(dir, { recursive: true, force: true });
}, 30000);
```

- [ ] **Step 2: Run to verify fail** — `bun test src/compose/concat-segments.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/compose/concat-segments.ts`:

```ts
import { execFileSync } from "node:child_process";

/** Concat uniform (same WxH/fps/pixfmt) videos, video-only, re-encoded. */
export function concatVideos(videoPaths: string[], outPath: string): void {
  const inputs = videoPaths.flatMap((p) => ["-i", p]);
  const streams = videoPaths.map((_, i) => `[${i}:v]`).join("");
  const filter = `${streams}concat=n=${videoPaths.length}:v=1:a=0[v]`;
  execFileSync("ffmpeg", ["-y", ...inputs, "-filter_complex", filter, "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "30", outPath], { stdio: "ignore" });
}

/** Concat wavs into one 48kHz stereo track. */
export function concatAudios(wavPaths: string[], outPath: string): void {
  const inputs = wavPaths.flatMap((p) => ["-i", p]);
  const streams = wavPaths.map((_, i) => `[${i}:a]`).join("");
  const filter = `${streams}concat=n=${wavPaths.length}:v=0:a=1[a]`;
  execFileSync("ffmpeg", ["-y", ...inputs, "-filter_complex", filter, "-map", "[a]", "-ar", "48000", "-ac", "2", outPath], { stdio: "ignore" });
}
```

- [ ] **Step 4: Run to verify pass** — `bun test src/compose/concat-segments.test.ts` → PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/compose/concat-segments.ts src/compose/concat-segments.test.ts
git commit -m "feat: ffmpeg video/audio concat helpers for segment stitching"
```

---

### Task 6: Footage-aware orchestrator + CLI (`src/pipeline/build-from-branch.ts`)

**Files:** Create `src/pipeline/build-from-branch.ts`; Test `src/pipeline/build-from-branch.test.ts`

**Interfaces:** `buildFromBranch(planPath: string, outDir: string): Promise<string>`
- Consumes all of the above + `mixFinalAudio`, `buildSfxTrack`, `sfxEventsFromPlan`, `selectLibraryTrack`, `resolveOrSynthMusic`, `buildOnePager`, `getPrContext`/`detectDemoVideo`.

**Behavior:** If the plan has no footage scene, or a footage scene but no resolvable clip → delegate to `buildFromPlan` (unchanged path). Else: split scenes at the footage beat, render front/back segments, normalize the clip, synth the demo-beat VO (padded to clip length), concat videos + VOs, mix music/SFX over the whole, mux, emit one-pager. Captions are NOT applied on the footage path (v1).

- [ ] **Step 1: Write the failing test** — `src/pipeline/build-from-branch.test.ts`:

```ts
import { test, expect } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildFromBranch } from "./build-from-branch";

function dur(p: string): number {
  return parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", p]).toString().trim());
}

test("buildFromBranch wraps a demo clip between generated beats", async () => {
  const dir = join(process.cwd(), "out/test-branch"); rmSync(dir, { recursive: true, force: true });
  execFileSync("mkdir", ["-p", dir]);
  // a tiny demo clip
  const clip = join(dir, "demo.mp4");
  execFileSync("ffmpeg", ["-y","-f","lavfi","-i","testsrc=size=640x360:rate=15","-t","2","-pix_fmt","yuv420p", clip], { stdio: "ignore" });
  // a plan: hook (generated) -> footage(demo) -> cta (generated)
  const plan = {
    feature_name: "F", value_prop: "v", persona: "p", when_to_use: "w", talking_points: ["t"],
    scenes: [
      { id: "hook", html: "<div style='color:var(--uip-white)'>Hook</div>", narration: "The hook." },
      { id: "demo", footage: { narration: "Here it is in action.", clipPath: clip } },
      { id: "cta", html: "<div style='color:var(--uip-white)'>CTA</div>", narration: "Learn more." },
    ],
    youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
  };
  const planPath = join(dir, "plan.json");
  execFileSync("bash", ["-lc", `cat > '${planPath}'`], { input: JSON.stringify(plan) });
  const out = await buildFromBranch(planPath, join(dir, "out"));
  expect(existsSync(out)).toBe(true);
  // total ≈ front + 2s clip + back; must exceed the 2s clip alone
  expect(dur(out)).toBeGreaterThan(4);
  const hasAudio = execFileSync("ffprobe", ["-v","error","-select_streams","a","-show_entries","stream=codec_type","-of","default=noprint_wrappers=1:nokey=1", out]).toString().trim();
  expect(hasAudio).toBe("audio");
  rmSync(dir, { recursive: true, force: true });
}, 300000);
```

- [ ] **Step 2: Run to verify fail** — `bun test src/pipeline/build-from-branch.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/pipeline/build-from-branch.ts`:

```ts
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { validatePlanV3, isFootageScene } from "../content-director/plan-schema";
import { loadBrandTokens } from "../brand/token-resolver";
import { getPrContext, detectDemoVideo } from "../ingest/pr-context";
import { buildFromPlan, pickSynthesizer, sfxEventsFromPlan } from "./build-plan";
import { renderSegment } from "./render-segment";
import { normalizeClip } from "../footage/normalize";
import { concatVideos, concatAudios } from "../compose/concat-segments";
import { mixFinalAudio } from "../audio/mix";
import { buildSfxTrack, type SfxEvent } from "../audio/sfx";
import { selectLibraryTrack } from "../audio/library";
import { resolveOrSynthMusic } from "../audio/music";
import { buildOnePager } from "../onepager/build-onepager";

function probeDur(p: string): number {
  return parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", p]).toString().trim());
}

export async function buildFromBranch(planPath: string, outDir: string): Promise<string> {
  const plan = validatePlanV3(JSON.parse(readFileSync(planPath, "utf8")));
  const footageIdx = plan.scenes.findIndex((s: any) => isFootageScene(s));

  let clipPath: string | null = null;
  if (footageIdx >= 0) {
    const fscene = plan.scenes[footageIdx] as any;
    if (fscene.footage.clipPath && existsSync(fscene.footage.clipPath)) clipPath = fscene.footage.clipPath;
    else clipPath = detectDemoVideo(getPrContext().diffFiles);
  }

  // No footage beat or no clip resolved → standard generated pipeline (unchanged).
  if (footageIdx < 0 || !clipPath) {
    if (footageIdx >= 0) console.log("No demo video found in the branch — generating the full video.");
    return buildFromPlan(planPath, outDir);
  }

  console.log(`Demo video: ${clipPath} — wrapping it in a full enablement video.`);
  const tokens = loadBrandTokens();
  const audioOut = join(outDir, "audio");
  mkdirSync(audioOut, { recursive: true });
  mkdirSync(join(outDir, "renders"), { recursive: true });

  const footageScene = plan.scenes[footageIdx] as any;
  const before = plan.scenes.slice(0, footageIdx);
  const after = plan.scenes.slice(footageIdx + 1);

  const front = before.length ? renderSegment(before as any, join(outDir, "seg-front")) : null;
  const back = after.length ? renderSegment(after as any, join(outDir, "seg-back")) : null;

  const clip = join(outDir, "clip.mp4");
  const { duration: clipDur } = normalizeClip(clipPath, clip);

  // demo-beat VO, padded/trimmed to the clip length
  const rawVo = join(audioOut, "demo-vo-raw.wav");
  pickSynthesizer().synthesize(footageScene.footage.narration, rawVo);
  const clipVo = join(audioOut, "demo-vo.wav");
  execFileSync("ffmpeg", ["-y", "-i", rawVo, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,apad", "-t", clipDur.toFixed(3), "-ar", "48000", "-ac", "2", clipVo], { stdio: "ignore" });

  const videos = [front?.videoPath, clip, back?.videoPath].filter(Boolean) as string[];
  const vos = [front?.voPath, clipVo, back?.voPath].filter(Boolean) as string[];
  const bodyVideo = join(outDir, "renders/body.mp4");
  concatVideos(videos, bodyVideo);
  const fullVo = join(audioOut, "vo-norm.wav");
  concatAudios(vos, fullVo);
  const total = probeDur(bodyVideo);

  // SFX: pops within generated segments (offset), whooshes at the two seams.
  const frontDur = front ? probeDur(front.videoPath) : 0;
  const events: SfxEvent[] = [];
  if (front) sfxEventsFromPlan({ scenes: before as any }).events.filter((e) => e.kind === "pop").forEach((e) => events.push(e));
  events.push({ at: frontDur, kind: "whoosh" });
  events.push({ at: frontDur + clipDur, kind: "whoosh" });
  if (back) sfxEventsFromPlan({ scenes: after as any }).events.filter((e) => e.kind === "pop").forEach((e) => events.push({ at: e.at + frontDur + clipDur, kind: "pop" }));

  const noMusic = process.env.ENABLEMENT_NO_MUSIC === "1", noSfx = process.env.ENABLEMENT_NO_SFX === "1";
  const libTrack = selectLibraryTrack((plan as any).music_mood, join(process.cwd(), "brand/audio/library"));
  const musicPath = noMusic ? null : (libTrack ?? resolveOrSynthMusic(join(process.cwd(), "brand/audio"), join(audioOut, "music-bed.wav"), total));
  let sfxPath: string | null = null;
  if (!noSfx) { sfxPath = join(audioOut, "sfx.wav"); buildSfxTrack(events, total, audioOut, sfxPath); }
  const finalAudio = join(audioOut, "final.wav");
  mixFinalAudio({ voPath: fullVo, musicPath, sfxPath, totalDurationSec: total, workDir: audioOut, outPath: finalAudio, musicGainDb: process.env.ENABLEMENT_MUSIC_GAIN_DB ? Number(process.env.ENABLEMENT_MUSIC_GAIN_DB) : undefined });

  const finalVideo = join(outDir, "renders/video.mp4");
  execFileSync("ffmpeg", ["-y", "-i", bodyVideo, "-i", finalAudio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", finalVideo], { stdio: "ignore" });

  try {
    const op = buildOnePager(plan as any, tokens, join(outDir, "onepager"), { videoPath: finalVideo });
    console.log(`One-pager: ${op.htmlPath}${op.pdfPath ? ` (+ ${op.pdfPath})` : ""}`);
  } catch (e: any) { console.warn("One-pager skipped:", e?.message); }

  console.log(`Rendered (footage-wrapped): ${finalVideo} (${total.toFixed(1)}s)`);
  return finalVideo;
}

if (import.meta.main) {
  const planPath = process.argv[2] || "demo/feature-video.v3.json";
  buildFromBranch(planPath, join(process.cwd(), "out/latest-v2")).then((p) => console.log("Done:", p));
}
```

- [ ] **Step 4: Run to verify pass** — with the render env exported:
```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use stable
export HYPERFRAMES_NODE_BIN="/Users/rakshithdattatrayahegde/.nvm/versions/node/v24.14.1/bin"
bun test src/pipeline/build-from-branch.test.ts
```
Expected: PASS (renders two tiny segments + concats the clip). This is slow (~1-2 min).

- [ ] **Step 5: Regression — the no-footage path is unchanged.**
```bash
bun test src/ingest/ src/footage/ src/compose/concat-segments.test.ts src/content-director/
```
Expected: all pass. (Do NOT re-run the full dogfood render here.)

- [ ] **Step 6: Commit**
```bash
git add src/pipeline/build-from-branch.ts src/pipeline/build-from-branch.test.ts
git commit -m "feat: footage-aware orchestrator — reuse PR demo clip wrapped in generated beats"
```

---

## Self-Review

- **Spec coverage:** ingest (T1), footage schema (T2), normalize (T3), segment renderer (T4), concat (T5), orchestrator+CLI (T6). Captions on footage path documented out-of-scope.
- **Placeholders:** none.
- **Type consistency:** `getPrContext`/`detectDemoVideo`, `isFootageScene`, `normalizeClip`, `renderSegment` ({videoPath,voPath,duration}), `concatVideos`/`concatAudios`, `buildFromBranch` — signatures match across definitions and the orchestrator's call sites. `sfxEventsFromPlan`/`mixFinalAudio`/`buildSfxTrack`/`selectLibraryTrack`/`resolveOrSynthMusic`/`buildOnePager` reused with their existing signatures.
- **Risk containment:** `buildFromPlan` is not modified; the footage path is a new orchestrator. No-footage plans delegate to the existing path unchanged.
- **Known v1 limitation:** no captions on the footage path; hard cut at seams (whoosh SFX masks); clip audio dropped in favor of authored demo VO. All documented.
