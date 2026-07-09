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
  // scale supports eval=frame; crop has no `eval` option in some ffmpeg builds but its x/y
  // are per-frame expressions by default (timeline-flagged), so no eval= needed there.
  return `scale=w='trunc(${W}*(${Z})/2)*2':h='trunc(${H}*(${Z})/2)*2':eval=frame,` +
         `crop=${W}:${H}:x='clip((${CX})*iw-${W / 2},0,iw-${W})':y='clip((${CY})*ih-${H / 2},0,ih-${H})'`;
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
