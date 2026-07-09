# Camera Director (auto-zoom) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add cinematic camera movement to the reused demo clip — a subtle default slow zoom, plus optional authored focus keyframes — via ffmpeg scale-up + sub-pixel center-crop (no jitter).

**Architecture:** New `src/footage/camera.ts` (`buildZoomFilter` pure + `applyCameraMove`), a `zoom` field on the footage scene schema, and a camera pass wired into `buildFromBranch` after `normalizeClip`. Footage-only; the generated/no-footage paths are untouched.

**Tech Stack:** TypeScript, bun, ffmpeg. No new deps.

## Global Constraints

- No new npm dependencies; ffmpeg only.
- Footage-only: do not change `buildFromPlan`, the composition, or the generated path.
- `scale ≥ 1` enforced (never zoom out past the frame). Conservative motion. `ENABLEMENT_NO_ZOOM=1` disables.
- The filter is a pure function of keyframes + duration (deterministic; no time/random values).

---

### Task 1: `ZoomKeyframe` on the footage schema (`src/content-director/plan-schema.ts`)

**Files:** Modify `src/content-director/plan-schema.ts`; Test `src/content-director/zoom-schema.test.ts`

**Interfaces:** `ZoomKeyframeSchema`; `FootageSceneSchema.footage` gains `zoom?: ZoomKeyframe[]`.

- [ ] **Step 1: Write the failing test** — `src/content-director/zoom-schema.test.ts`:

```ts
import { test, expect } from "bun:test";
import { validatePlanV3 } from "./plan-schema";

const base = {
  feature_name: "F", value_prop: "v", persona: "p", when_to_use: "w", talking_points: ["t"],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
};

test("footage scene accepts a zoom keyframe track", () => {
  const plan = validatePlanV3({ ...base, scenes: [
    { id: "demo", footage: { narration: "n", zoom: [ { at: 0, scale: 1 }, { at: 2, scale: 1.2, x: 0.8, y: 0.3, ease: "smooth" } ] } },
  ]});
  const z = (plan.scenes[0] as any).footage.zoom;
  expect(z.length).toBe(2);
  expect(z[1].scale).toBe(1.2);
  expect(z[1].x).toBe(0.8);
});

test("zoom scale < 1 is rejected", () => {
  expect(() => validatePlanV3({ ...base, scenes: [
    { id: "demo", footage: { narration: "n", zoom: [ { at: 0, scale: 0.5 } ] } },
  ]})).toThrow();
});

test("footage scene without zoom still parses", () => {
  const plan = validatePlanV3({ ...base, scenes: [ { id: "demo", footage: { narration: "n" } } ] });
  expect((plan.scenes[0] as any).footage.zoom).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify fail** — `bun test src/content-director/zoom-schema.test.ts` → FAIL (zoom rejected by strict object / scale<1 not enforced).

- [ ] **Step 3: Implement.** In `src/content-director/plan-schema.ts`, ADD before `FootageSceneSchema`:

```ts
export const ZoomKeyframeSchema = z.object({
  at: z.number().nonnegative(),
  scale: z.number().min(1),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  ease: z.enum(["linear", "smooth"]).optional(),
});
export type ZoomKeyframe = z.infer<typeof ZoomKeyframeSchema>;
```

Then in `FootageSceneSchema`, change the `footage` object from:
```ts
  footage: z.object({ narration: z.string().min(1), clipPath: z.string().optional() }),
```
to:
```ts
  footage: z.object({ narration: z.string().min(1), clipPath: z.string().optional(), zoom: z.array(ZoomKeyframeSchema).optional() }),
```

- [ ] **Step 4: Run to verify pass** — `bun test src/content-director/zoom-schema.test.ts` → PASS (3). Also `bun test src/content-director/` → no regression.

- [ ] **Step 5: Commit**
```bash
git add src/content-director/plan-schema.ts src/content-director/zoom-schema.test.ts
git commit -m "feat: zoom keyframe track on the footage scene schema"
```

---

### Task 2: Camera module (`src/footage/camera.ts`)

**Files:** Create `src/footage/camera.ts`; Test `src/footage/camera.test.ts`

**Interfaces:**
- `type ZoomKeyframe = { at: number; scale: number; x?: number; y?: number; ease?: "linear" | "smooth" }`
- `buildZoomFilter(keyframes: ZoomKeyframe[], opts: { durationSec: number; width?: number; height?: number }): string`
- `applyCameraMove(inClip: string, outClip: string, opts: { durationSec: number; width?: number; height?: number; fps?: number; zoom?: ZoomKeyframe[] }): void`

- [ ] **Step 1: Write the failing test** — `src/footage/camera.test.ts`:

```ts
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildZoomFilter, applyCameraMove } from "./camera";

function balanced(s: string): boolean {
  let d = 0; for (const c of s) { if (c === "(") d++; else if (c === ")") d--; if (d < 0) return false; } return d === 0;
}

test("buildZoomFilter default (no keyframes) → scale+crop with a 1.06 target", () => {
  const f = buildZoomFilter([], { durationSec: 4 });
  expect(f).toContain("scale=");
  expect(f).toContain("crop=1920:1080");
  expect(f).toContain("1.06");
  expect(balanced(f)).toBe(true);
});

test("buildZoomFilter references keyframe values and stays balanced", () => {
  const f = buildZoomFilter([ { at: 0, scale: 1 }, { at: 2, scale: 1.2, x: 0.8, y: 0.3 } ], { durationSec: 2 });
  expect(f).toContain("1.2");
  expect(f).toContain("0.8");
  expect(f).toContain("0.3");
  expect(balanced(f)).toBe(true);
});

test("applyCameraMove outputs 1920x1080 video-only of ~same duration", () => {
  const dir = join(process.cwd(), "out/test-camera"); mkdirSync(dir, { recursive: true });
  const src = join(dir, "s.mp4"), out = join(dir, "o.mp4");
  execFileSync("ffmpeg", ["-y","-f","lavfi","-i","testsrc=size=1920x1080:rate=30","-t","2","-pix_fmt","yuv420p", src], { stdio: "ignore" });
  applyCameraMove(src, out, { durationSec: 2 });
  const probe = (e: string) => execFileSync("ffprobe", ["-v","error","-select_streams","v:0","-show_entries",e,"-of","default=noprint_wrappers=1:nokey=1", out]).toString().trim();
  expect(probe("stream=width")).toBe("1920");
  expect(probe("stream=height")).toBe("1080");
  const dur = parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", out]).toString().trim());
  expect(Math.abs(dur - 2)).toBeLessThan(0.3);
  const hasAudio = execFileSync("ffprobe", ["-v","error","-select_streams","a","-show_entries","stream=codec_type","-of","default=noprint_wrappers=1:nokey=1", out]).toString().trim();
  expect(hasAudio).toBe("");
  rmSync(dir, { recursive: true, force: true });
}, 60000);
```

- [ ] **Step 2: Run to verify fail** — `bun test src/footage/camera.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/footage/camera.ts`:

```ts
import { execFileSync } from "node:child_process";

export type ZoomKeyframe = { at: number; scale: number; x?: number; y?: number; ease?: "linear" | "smooth" };

const n = (x: number) => { const v = Number(x.toFixed(5)); return Object.is(v, -0) ? "0" : String(v); };

/** Piecewise smooth-eased ffmpeg expression over time `t` for (at, value) points (holds ends). */
function pieces(points: { at: number; v: number }[]): string {
  if (points.length === 1) return n(points[0].v);
  let expr = n(points[points.length - 1].v); // t >= last.at → last value
  for (let i = points.length - 2; i >= 0; i--) {
    const t0 = points[i].at, t1 = points[i + 1].at, v0 = points[i].v, v1 = points[i + 1].v;
    const dt = (t1 - t0) || 1e-6;
    const p = `clip((t-${n(t0)})/${n(dt)},0,1)`;
    const seg = `(${n(v0)}+${n(v1 - v0)}*(${p}*${p}*(3-2*${p})))`;
    expr = `if(lt(t,${n(t1)}),${seg},${expr})`;
  }
  return expr;
}

/** Pure: ffmpeg -vf string. Scale up by Z(t) (sub-pixel) then center-crop WxH → smooth, jitter-free zoom/pan. */
export function buildZoomFilter(keyframes: ZoomKeyframe[], opts: { durationSec: number; width?: number; height?: number }): string {
  const W = opts.width ?? 1920, H = opts.height ?? 1080;
  let kfs = (keyframes && keyframes.length)
    ? [...keyframes]
    : [{ at: 0, scale: 1, x: 0.5, y: 0.5 }, { at: Math.max(0.1, opts.durationSec), scale: 1.06, x: 0.5, y: 0.5 }];
  kfs = kfs
    .map((k) => ({ at: Math.max(0, k.at), scale: Math.max(1, k.scale), x: k.x ?? 0.5, y: k.y ?? 0.5 }))
    .sort((a, b) => a.at - b.at)
    .filter((k, i, arr) => i === arr.length - 1 || arr[i + 1].at !== k.at);
  const Z = pieces(kfs.map((k) => ({ at: k.at, v: k.scale })));
  const CX = pieces(kfs.map((k) => ({ at: k.at, v: k.x })));
  const CY = pieces(kfs.map((k) => ({ at: k.at, v: k.y })));
  return `scale=w='trunc(${W}*(${Z})/2)*2':h='trunc(${H}*(${Z})/2)*2':eval=frame,` +
         `crop=${W}:${H}:x='clip((${CX})*iw-${W / 2},0,iw-${W})':y='clip((${CY})*ih-${H / 2},0,ih-${H})':eval=frame`;
}

/** Apply the camera move to a clip (video-only output). */
export function applyCameraMove(
  inClip: string, outClip: string,
  opts: { durationSec: number; width?: number; height?: number; fps?: number; zoom?: ZoomKeyframe[] },
): void {
  const fps = opts.fps ?? 30;
  const vf = buildZoomFilter(opts.zoom ?? [], { durationSec: opts.durationSec, width: opts.width, height: opts.height });
  execFileSync("ffmpeg", ["-y", "-i", inClip, "-vf", vf, "-an", "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", String(fps), outClip], { stdio: "ignore" });
}
```

- [ ] **Step 4: Run to verify pass** — `bun test src/footage/camera.test.ts` → PASS (3).

- [ ] **Step 5: Commit**
```bash
git add src/footage/camera.ts src/footage/camera.test.ts
git commit -m "feat: camera director — jitter-free zoom/pan via scale-up + center-crop"
```

---

### Task 3: Wire the camera pass into `build-from-branch.ts`

**Files:** Modify `src/pipeline/build-from-branch.ts`; Test `src/pipeline/build-from-branch-zoom.test.ts`

**Context:** In `buildFromBranch`, the footage path does `const { duration: clipDur } = normalizeClip(clipPath, clip);` then builds `const videos = [front?.videoPath, clip, back?.videoPath].filter(Boolean)`. Insert a camera pass between them and use the moved clip in `videos`. `footageScene` (with `.footage.zoom`) is in scope.

- [ ] **Step 1: Write the failing test** — `src/pipeline/build-from-branch-zoom.test.ts`:

```ts
import { test, expect } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildFromBranch } from "./build-from-branch";

test("footage path applies the camera move (clip-cam.mp4 produced) and still renders", async () => {
  const dir = join(process.cwd(), "out/test-branch-zoom"); rmSync(dir, { recursive: true, force: true });
  execFileSync("mkdir", ["-p", dir]);
  const clip = join(dir, "demo.mp4");
  execFileSync("ffmpeg", ["-y","-f","lavfi","-i","testsrc=size=1920x1080:rate=30","-t","2","-pix_fmt","yuv420p", clip], { stdio: "ignore" });
  const plan = {
    feature_name: "F", value_prop: "v", persona: "p", when_to_use: "w", talking_points: ["t"],
    scenes: [
      { id: "hook", html: "<div style='color:var(--uip-white)'>Hook</div>", narration: "The hook." },
      { id: "demo", footage: { narration: "In action.", clipPath: clip, zoom: [ { at: 0, scale: 1 }, { at: 2, scale: 1.12, x: 0.7, y: 0.4 } ] } },
    ],
    youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
  };
  const planPath = join(dir, "plan.json");
  execFileSync("bash", ["-lc", `cat > '${planPath}'`], { input: JSON.stringify(plan) });
  const outDir = join(dir, "out");
  const out = await buildFromBranch(planPath, outDir);
  expect(existsSync(join(outDir, "clip-cam.mp4"))).toBe(true); // camera pass ran
  expect(existsSync(out)).toBe(true);
  const hasAudio = execFileSync("ffprobe", ["-v","error","-select_streams","a","-show_entries","stream=codec_type","-of","default=noprint_wrappers=1:nokey=1", out]).toString().trim();
  expect(hasAudio).toBe("audio");
  rmSync(dir, { recursive: true, force: true });
}, 300000);
```

- [ ] **Step 2: Run to verify fail** — `bun test src/pipeline/build-from-branch-zoom.test.ts` (with render env: NVM, HYPERFRAMES_NODE_BIN, ELEVENLABS_VOICE_ID=ErXwobaYiN019PkySvjV) → FAIL (no `clip-cam.mp4`).

- [ ] **Step 3: Implement.** In `src/pipeline/build-from-branch.ts`:

(a) Add import near the others:
```ts
import { applyCameraMove } from "../footage/camera";
```

(b) Find:
```ts
  const clip = join(outDir, "clip.mp4");
  const { duration: clipDur } = normalizeClip(clipPath, clip);
```
and add AFTER it:
```ts
  // Camera director: subtle default zoom (or authored keyframes) on the footage. Video-only.
  let clipForConcat = clip;
  if (process.env.ENABLEMENT_NO_ZOOM !== "1") {
    const moved = join(outDir, "clip-cam.mp4");
    applyCameraMove(clip, moved, { durationSec: clipDur, zoom: (footageScene.footage.zoom as any) });
    clipForConcat = moved;
  }
```

(c) Find:
```ts
  const videos = [front?.videoPath, clip, back?.videoPath].filter(Boolean) as string[];
```
and change `clip` → `clipForConcat`:
```ts
  const videos = [front?.videoPath, clipForConcat, back?.videoPath].filter(Boolean) as string[];
```
Leave everything else (VO, concat, mix, captions, QA, one-pager) unchanged. `clipDur` is still used for the demo VO padding (the camera move preserves duration).

- [ ] **Step 4: Run to verify pass** — with render env exported:
```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use stable
export HYPERFRAMES_NODE_BIN="/Users/rakshithdattatrayahegde/.nvm/versions/node/v24.14.1/bin"
export ELEVENLABS_VOICE_ID="ErXwobaYiN019PkySvjV"; export ELEVENLABS_STYLE="0.6"; export ELEVENLABS_STABILITY="0.35"
bun test src/pipeline/build-from-branch-zoom.test.ts
```
Expected: PASS — `clip-cam.mp4` exists, final video has audio.

- [ ] **Step 5: Regression** — `bun test src/pipeline/build-from-branch.test.ts` (same env) → PASS (default zoom now applied; still renders video+audio).

- [ ] **Step 6: Commit**
```bash
git add src/pipeline/build-from-branch.ts src/pipeline/build-from-branch-zoom.test.ts
git commit -m "feat: wire camera director into the footage path (default zoom + keyframes)"
```

---

## Self-Review

- **Coverage:** schema field (T1), pure filter + ffmpeg apply (T2), wiring + escape hatch (T3). All spec sections covered.
- **Placeholders:** none.
- **Type consistency:** `buildZoomFilter`/`applyCameraMove` signatures match definitions and the wiring call; `ZoomKeyframe` (camera.ts) is structurally compatible with the schema's `ZoomKeyframe` (both `{at,scale,x?,y?,ease?}`); the wiring passes `footageScene.footage.zoom` as the `zoom` opt.
- **Non-regression:** footage-only; `buildFromPlan`, composition, generated path untouched. `ENABLEMENT_NO_ZOOM=1` disables. `clipDur` (used for VO padding) is preserved by the camera pass (duration unchanged).
- **Jitter avoidance:** scale-up + sub-pixel center-crop (not zoompan); conservative default (1.0→1.06 smooth).
