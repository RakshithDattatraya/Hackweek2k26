import { test, expect } from "bun:test";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildComposition } from "./build-composition";
import { loadBrandTokens } from "../brand/token-resolver";
import { validatePlan } from "../content-director/plan-schema";
import sample from "../../fixtures/sample-plan.json";

const outDir = join(process.cwd(), "out/test-compose");

test("writes index.html with cumulative starts and paused timeline", () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const plan = validatePlan(sample);
  const { indexPath, totalDuration } = buildComposition(plan, loadBrandTokens(), outDir, "audio/vo.wav");
  const html = readFileSync(indexPath, "utf8");
  expect(totalDuration).toBe(19); // 4+4+4+4+3
  expect(html).toContain('data-start="0"');
  expect(html).toContain('data-start="8"'); // third scene starts after 4+4
  expect(html).toContain("gsap.timeline({ paused: true })");
  expect(html).toContain('window.__timelines["enablement"]');
  expect(html).toContain('<audio id="vo" src="audio/vo.wav"');
  expect(existsSync(join(outDir, "meta.json"))).toBe(true);
});
