import { test, expect } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { saySynthesizer } from "./tts";

const dir = join(process.cwd(), "out/test-tts");

test("say synthesizer produces a non-empty wav", () => {
  mkdirSync(dir, { recursive: true });
  const wav = join(dir, "s.wav");
  if (existsSync(wav)) rmSync(wav);
  saySynthesizer.synthesize("Hello from UiPath enablement.", wav);
  expect(existsSync(wav)).toBe(true);
  const dur = parseFloat(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", wav]).toString().trim(),
  );
  expect(dur).toBeGreaterThan(0.5);
});
