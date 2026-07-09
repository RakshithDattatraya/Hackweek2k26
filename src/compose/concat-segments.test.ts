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
