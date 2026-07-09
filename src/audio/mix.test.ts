import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { mixFinalAudio } from "./mix";
import { synthMusicBed } from "./music";
import { buildSfxTrack } from "./sfx";

function dur(path: string): number {
  return parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", path]).toString().trim());
}
function hasAudio(path: string): boolean {
  return execFileSync("ffprobe", ["-v","error","-select_streams","a","-show_entries","stream=codec_type","-of","default=noprint_wrappers=1:nokey=1", path]).toString().trim() === "audio";
}
function makeVo(path: string, d: number) {
  execFileSync("ffmpeg", ["-y","-f","lavfi","-i",`sine=frequency=200:duration=${d}`,"-ar","48000","-ac","2", path], { stdio: "ignore" });
}

test("mixFinalAudio mixes VO + music + sfx to ~total with audio", () => {
  const dir = join(process.cwd(), "out/test-mix"); mkdirSync(dir, { recursive: true });
  const vo = join(dir, "vo.wav"), music = join(dir, "m.wav"), sfx = join(dir, "s.wav"), out = join(dir, "final.wav");
  makeVo(vo, 5); synthMusicBed(music, 3 /* shorter → must loop */); buildSfxTrack([{ at: 1, kind: "pop" }], 5, dir, sfx);
  mixFinalAudio({ voPath: vo, musicPath: music, sfxPath: sfx, totalDurationSec: 5, workDir: dir, outPath: out });
  expect(existsSync(out)).toBe(true);
  expect(hasAudio(out)).toBe(true);
  expect(Math.abs(dur(out) - 5)).toBeLessThan(0.2);
  rmSync(dir, { recursive: true, force: true });
});

test("mixFinalAudio with null music and null sfx passes VO through", () => {
  const dir = join(process.cwd(), "out/test-mix2"); mkdirSync(dir, { recursive: true });
  const vo = join(dir, "vo.wav"), out = join(dir, "final.wav");
  makeVo(vo, 4);
  mixFinalAudio({ voPath: vo, musicPath: null, sfxPath: null, totalDurationSec: 4, workDir: dir, outPath: out });
  expect(hasAudio(out)).toBe(true);
  expect(Math.abs(dur(out) - 4)).toBeLessThan(0.2);
  rmSync(dir, { recursive: true, force: true });
});
