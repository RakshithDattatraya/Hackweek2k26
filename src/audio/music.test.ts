import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveMusicTrack, synthMusicBed, resolveOrSynthMusic } from "./music";

function dur(path: string): number {
  return parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", path]).toString().trim());
}

test("synthMusicBed writes a wav of ~requested duration", () => {
  const dir = join(process.cwd(), "out/test-music"); mkdirSync(dir, { recursive: true });
  const out = join(dir, "bed.wav");
  synthMusicBed(out, 3);
  expect(existsSync(out)).toBe(true);
  expect(Math.abs(dur(out) - 3)).toBeLessThan(0.15);
  rmSync(dir, { recursive: true, force: true });
});

test("resolveMusicTrack: none → null, one → that file, many → throws", () => {
  const dir = join(process.cwd(), "out/test-music-res"); mkdirSync(dir, { recursive: true });
  expect(resolveMusicTrack(dir)).toBeNull();
  writeFileSync(join(dir, "track.mp3"), "x");
  writeFileSync(join(dir, "sfx-ignore.wav"), "x"); // sfx- prefix ignored
  expect(resolveMusicTrack(dir)).toBe(join(dir, "track.mp3"));
  writeFileSync(join(dir, "second.wav"), "x");
  expect(() => resolveMusicTrack(dir)).toThrow();
  rmSync(dir, { recursive: true, force: true });
});

test("resolveOrSynthMusic falls back to synth when no track present", () => {
  const dir = join(process.cwd(), "out/test-music-fb"); mkdirSync(dir, { recursive: true });
  const brand = join(dir, "brand-audio"); mkdirSync(brand, { recursive: true });
  const out = join(dir, "music-bed.wav");
  const used = resolveOrSynthMusic(brand, out, 2.5);
  expect(used).toBe(out);
  expect(Math.abs(dur(out) - 2.5)).toBeLessThan(0.15);
  rmSync(dir, { recursive: true, force: true });
});
