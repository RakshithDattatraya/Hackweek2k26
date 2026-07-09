import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { synthWhoosh, synthPop, buildSfxTrack } from "./sfx";

function dur(path: string): number {
  return parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", path]).toString().trim());
}

test("synthWhoosh and synthPop produce non-empty wavs", () => {
  const dir = join(process.cwd(), "out/test-sfx1"); mkdirSync(dir, { recursive: true });
  const w = join(dir, "w.wav"), p = join(dir, "p.wav");
  synthWhoosh(w); synthPop(p);
  expect(statSync(w).size).toBeGreaterThan(1000);
  expect(statSync(p).size).toBeGreaterThan(500);
  rmSync(dir, { recursive: true, force: true });
});

test("buildSfxTrack places events onto a bed of total duration", () => {
  const dir = join(process.cwd(), "out/test-sfx2"); mkdirSync(dir, { recursive: true });
  const out = join(dir, "sfx.wav");
  buildSfxTrack([{ at: 1, kind: "pop" }, { at: 2.5, kind: "whoosh" }], 5, dir, out);
  expect(existsSync(out)).toBe(true);
  expect(Math.abs(dur(out) - 5)).toBeLessThan(0.15);
  rmSync(dir, { recursive: true, force: true });
});

test("buildSfxTrack with zero events → silent bed of total", () => {
  const dir = join(process.cwd(), "out/test-sfx3"); mkdirSync(dir, { recursive: true });
  const out = join(dir, "sfx.wav");
  buildSfxTrack([], 4, dir, out);
  expect(Math.abs(dur(out) - 4)).toBeLessThan(0.15);
  rmSync(dir, { recursive: true, force: true });
});
