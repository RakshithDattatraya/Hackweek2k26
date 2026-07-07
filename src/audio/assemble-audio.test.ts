import { test, expect } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { synthesizePlanAudio, wavDuration } from "./assemble-audio";
import { saySynthesizer } from "./tts";
import { validatePlan } from "../content-director/plan-schema";
import sample from "../../fixtures/sample-plan.json";

const audioDir = join(process.cwd(), "out/test-audio");

test("VO length drives scene durations and produces aligned vo.wav", () => {
  if (existsSync(audioDir)) rmSync(audioDir, { recursive: true });
  mkdirSync(audioDir, { recursive: true });
  const plan = validatePlan(sample);
  const { planWithTiming, combinedWav } = synthesizePlanAudio(plan, saySynthesizer, audioDir, 0.6);
  expect(existsSync(combinedWav)).toBe(true);

  const totalScenes = planWithTiming.scenes.reduce((a, s) => a + s.duration, 0);
  const audioLen = wavDuration(combinedWav);
  // combined audio is each scene padded to its (content-driven) duration, so it matches total scene time
  expect(Math.abs(audioLen - totalScenes)).toBeLessThan(0.5);
  // audioDir is resolved to absolute for ffmpeg concat path safety
  expect(combinedWav.startsWith("/")).toBe(true);
  // durations are now content-driven, not the fixture's fixed values
  expect(planWithTiming.scenes[0].duration).toBeGreaterThanOrEqual(2);
});
