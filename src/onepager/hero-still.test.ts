import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractHeroStill, pngToDataUri } from "./hero-still";

test("extractHeroStill writes a PNG and pngToDataUri encodes it", () => {
  const dir = join(process.cwd(), "out/test-hero"); mkdirSync(dir, { recursive: true });
  const vid = join(dir, "v.mp4"), png = join(dir, "h.png");
  execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10", "-t", "2", "-pix_fmt", "yuv420p", vid], { stdio: "ignore" });
  extractHeroStill(vid, 1, png);
  expect(statSync(png).size).toBeGreaterThan(1000);
  const uri = pngToDataUri(png);
  expect(uri.startsWith("data:image/png;base64,")).toBe(true);
  expect(uri.length).toBeGreaterThan(100);
  rmSync(dir, { recursive: true, force: true });
});
