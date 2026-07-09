import { test, expect } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadLibrary, selectLibraryTrack } from "./library";

function tmp(name: string): string {
  const d = join(process.cwd(), "out", name); mkdirSync(d, { recursive: true }); return d;
}

test("loadLibrary reads library.json with paths resolved absolute", () => {
  const d = tmp("test-lib-json");
  writeFileSync(join(d, "a.mp3"), "x"); writeFileSync(join(d, "b.mp3"), "x");
  writeFileSync(join(d, "library.json"), JSON.stringify([
    { file: "a.mp3", mood: "uplifting", bpm: 90 },
    { file: "b.mp3", mood: "calm" },
  ]));
  const lib = loadLibrary(d);
  expect(lib.length).toBe(2);
  expect(lib[0].file).toBe(join(d, "a.mp3"));
  expect(lib[0].mood).toBe("uplifting");
  rmSync(d, { recursive: true, force: true });
});

test("loadLibrary infers mood from filename prefix when no manifest", () => {
  const d = tmp("test-lib-infer");
  writeFileSync(join(d, "uplifting-corporate.mp3"), "x");
  writeFileSync(join(d, "calm.wav"), "x");
  writeFileSync(join(d, "notes.txt"), "x"); // ignored (not audio)
  const lib = loadLibrary(d);
  const moods = lib.map((e) => e.mood).sort();
  expect(moods).toEqual(["calm", "uplifting"]);
  rmSync(d, { recursive: true, force: true });
});

test("selectLibraryTrack: mood match, unknown→first(sorted), empty→null", () => {
  const empty = tmp("test-lib-empty");
  expect(selectLibraryTrack("uplifting", empty)).toBeNull();
  const d = tmp("test-lib-sel");
  writeFileSync(join(d, "calm.mp3"), "x");
  writeFileSync(join(d, "uplifting.mp3"), "x");
  expect(selectLibraryTrack("UPLIFTING", d)).toBe(join(d, "uplifting.mp3")); // case-insensitive
  expect(selectLibraryTrack("nonexistent", d)).toBe(join(d, "calm.mp3"));    // first sorted by file
  expect(selectLibraryTrack(undefined, d)).toBe(join(d, "calm.mp3"));
  rmSync(empty, { recursive: true, force: true }); rmSync(d, { recursive: true, force: true });
});

test("loadLibrary skips manifest entries whose file is missing", () => {
  const d = tmp("test-lib-missing");
  writeFileSync(join(d, "real.mp3"), "x");
  writeFileSync(join(d, "library.json"), JSON.stringify([
    { file: "real.mp3", mood: "calm" },
    { file: "ghost.mp3", mood: "energetic" },
  ]));
  const lib = loadLibrary(d);
  expect(lib.length).toBe(1);
  expect(lib[0].mood).toBe("calm");
  rmSync(d, { recursive: true, force: true });
});
