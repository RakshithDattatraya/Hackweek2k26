import { test, expect } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { run } from "./run";

const outDir = join(process.cwd(), "out/e2e");

// Integration test: needs ffmpeg, `say`, Node 22+ (nvm stable), and Chrome. Slow (~30-60s).
test("prompt -> narrated branded mp4 with video + audio streams", async () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const mp4 = await run("Agentic Document Understanding extracts data from any document and self-corrects low-confidence fields.", outDir);
  expect(existsSync(mp4)).toBe(true);

  const streams = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1", mp4]).toString();
  expect(streams).toContain("video");
  expect(streams).toContain("audio");
}, 120000);
