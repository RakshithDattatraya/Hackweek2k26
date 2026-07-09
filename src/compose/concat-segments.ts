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
