import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Extract a single frame at atSec from videoPath to outPngPath (scaled to 1280 wide). Deterministic. */
export function extractHeroStill(videoPath: string, atSec: number, outPngPath: string): void {
  execFileSync("ffmpeg", ["-y", "-ss", String(atSec), "-i", videoPath, "-frames:v", "1", "-vf", "scale=1280:-1", outPngPath], { stdio: "ignore" });
}

/** Read a PNG file and return it as a data: URI (self-contained embedding). */
export function pngToDataUri(pngPath: string): string {
  return `data:image/png;base64,${readFileSync(pngPath).toString("base64")}`;
}
