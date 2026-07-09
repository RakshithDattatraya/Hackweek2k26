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
