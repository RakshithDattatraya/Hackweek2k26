# Camera Director (auto-zoom on footage) — Design Spec

**Date:** 2026-07-10
**Sub-project:** Camera director / auto-zoom (Milestone 8)
**Status:** Draft design → pending user review

## Goal

Give the reused demo clip cinematic camera movement so a static screen recording feels
premium instead of flat. Two modes, composable:
- **Default:** a subtle, slow center zoom (scale 1.0 → 1.06 over the clip, smooth ease) —
  zero config, applied to every footage clip unless disabled.
- **Authored keyframes:** the plan's footage scene may specify a focus track
  `zoom: [{ at, scale, x, y, ease? }]` to punch into specific UI regions at specific times;
  the compositor eases between them.

Targeting is hand-specified (we reuse a provided clip → no Playwright ROI data), motion is
hand-tuned and conservative — exactly the brief's rule ("automate targeting; hand-tune motion;
bad auto-zoom is worse than none").

## Why the ffmpeg technique matters

The obvious tool, `zoompan`, rounds its pan offsets to integer pixels every frame → visible
jitter on slow zooms (the classic "zoompan shake"), which reads as nauseating — the exact
failure mode to avoid. Instead we **scale the frame up by Z(t) with sub-pixel interpolation,
then center-crop a fixed 1920×1080 window**. The scale filter interpolates smoothly, and the
crop offset moving by ≤1px on a large scaled frame is imperceptible. Result: smooth motion.

## Architecture

Applies only to the footage clip, after `normalizeClip` (which already outputs 1920×1080/30),
before the clip enters the concat in `buildFromBranch`. Generated beats keep their own GSAP
motion (untouched).

### New unit — `src/footage/camera.ts`

- `type ZoomKeyframe = { at: number; scale: number; x?: number; y?: number; ease?: "linear" | "smooth" }`
  — `at` = seconds into the clip; `scale` ≥ 1; `x`,`y` = focal center in 0..1 (default 0.5).
- `buildZoomFilter(keyframes: ZoomKeyframe[], opts: { durationSec: number; width?: number; height?: number }): string`
  — PURE: returns the ffmpeg `-vf` filter string. Builds piecewise smooth-eased expressions
  `Z(t)`, `CX(t)`, `CY(t)` from the keyframes (hold first value before the first kf, last after
  the last), then:
  ```
  scale=w='trunc(W*(Z)/2)*2':h='trunc(H*(Z)/2)*2':eval=frame,
  crop=W:H:x='clip((CX)*iw-W/2,0,iw-W)':y='clip((CY)*ih-H/2,0,ih-H)':eval=frame
  ```
  (W,H default 1920×1080). If `keyframes` is empty, synthesize the default two-keyframe track
  `[{at:0,scale:1},{at:durationSec,scale:1.06}]`.
- `applyCameraMove(inClip: string, outClip: string, opts: { durationSec: number; width?: number; height?: number; fps?: number; zoom?: ZoomKeyframe[] }): void`
  — run `ffmpeg -i in -vf <buildZoomFilter(...)> -an -c:v libx264 -pix_fmt yuv420p -r fps out`.
  Video-only (audio handled separately, as today).

### Schema — `src/content-director/plan-schema.ts`

Extend `FootageSceneSchema.footage` to add `zoom: z.array(ZoomKeyframeSchema).optional()` where
`ZoomKeyframeSchema = z.object({ at: z.number().nonnegative(), scale: z.number().min(1), x: z.number().min(0).max(1).optional(), y: z.number().min(0).max(1).optional(), ease: z.enum(["linear","smooth"]).optional() })`.

### Wiring — `src/pipeline/build-from-branch.ts`

After `normalizeClip(clipPath, clip)` → `{ duration: clipDur }`, add a camera pass:
```ts
const moved = join(outDir, "clip-cam.mp4");
if (process.env.ENABLEMENT_NO_ZOOM === "1") { /* use `clip` as-is */ }
else { applyCameraMove(clip, moved, { durationSec: clipDur, zoom: footageScene.footage.zoom }); }
```
Use the moved clip (or `clip` if disabled) in the `videos` concat array. Everything else unchanged.

## Determinism / safety

- The filter is a pure function of keyframes + duration; ffmpeg is deterministic. No time/random.
- Conservative defaults (1.0→1.06, smooth) minimize motion-sickness risk.
- `ENABLEMENT_NO_ZOOM=1` escape hatch; empty/absent keyframes → gentle default; `scale ≥ 1`
  enforced by schema so we never zoom out past the frame.

## Testing

- `camera.test.ts`:
  - `buildZoomFilter([])` → contains `scale=` + `crop=1920:1080` and a Z expression ending near 1.06.
  - `buildZoomFilter([{at:0,scale:1},{at:2,scale:1.2,x:0.8,y:0.3}])` → expression references the
    keyframe values (1.2, 0.8, 0.3) and is well-formed (balanced parens).
  - `applyCameraMove` on a 2s 1920×1080 test clip → output is 1920×1080, duration ≈ 2s, video-only;
    a frame sampled near the end is more zoomed than t=0 (assert via a cheap check, e.g. output
    exists + dimensions; visual zoom confirmed in the e2e step).
- `plan-schema`: a footage scene with a `zoom` array parses; `scale < 1` rejected.
- e2e (manual/CI-optional): `buildFromBranch` with a footage clip + a zoom track renders and the
  clip segment shows movement; QA still ok.

## Out of scope

- Automatic ROI detection (cursor/motion/CV) — fragile, brief warns against it.
- Zoom on generated beats (they already animate).
- Rotation / 3D / speed-ramp effects.

## Global constraints (carried)

- No new npm deps; ffmpeg only. bun runtime.
- Footage-only; generated path and no-footage path unchanged.
- Conservative motion; escape hatch to disable.
