import { test, expect } from "bun:test";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildCompositionV2 } from "./build-composition-v2";
import { loadBrandTokens } from "../brand/token-resolver";

const outDir = join(process.cwd(), "out/test-compose-v2");
const plan = {
  feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  scenes: [
    { id: "a", component: "statement", props: { headline: "First" }, narration: "n", duration: 4 },
    { id: "b", component: "cta", props: { headline: "Last" }, narration: "n", duration: 3 },
  ],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
} as any;

test("builds index.html with cumulative starts, clips, paused timeline", () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const { indexPath, totalDuration } = buildCompositionV2(plan, loadBrandTokens(), outDir, { audioRelPath: "audio/vo.wav" });
  const html = readFileSync(indexPath, "utf8");
  expect(totalDuration).toBe(7);
  expect(html).toContain('data-start="0.00"');
  expect(html).toContain('data-start="4.00"');
  expect(html).toContain('class="clip scene"');
  expect(html).toContain("gsap.timeline({ paused: true })");
  expect(html).toContain('window.__timelines["feature-video"]');
  expect(html).toContain("First");
  expect(html).toContain("Last");
  expect(existsSync(join(outDir, "meta.json"))).toBe(true);
});
