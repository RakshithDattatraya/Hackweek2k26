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
