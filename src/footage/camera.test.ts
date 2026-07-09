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
