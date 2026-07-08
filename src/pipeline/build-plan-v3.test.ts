import { test, expect } from "bun:test";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildFromPlan } from "./build-plan";

const outDir = join(process.cwd(), "out/e2e-v3");

// Integration: needs say, ffmpeg, Node 22+ (HYPERFRAMES_NODE_BIN), Chrome. Slow (~1-2 min).
test("free-form v3 plan -> QA-passing narrated mp4 (video+audio)", async () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const mp4 = await buildFromPlan(join(process.cwd(), "fixtures/sample-plan.v3.json"), outDir);
  expect(existsSync(mp4)).toBe(true);
  const streams = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1", mp4]).toString();
  expect(streams).toContain("video");
  expect(streams).toContain("audio");
  const qa = JSON.parse(readFileSync(join(outDir, "qa-report.json"), "utf8"));
  expect(qa.ok).toBe(true);
}, 180000);
