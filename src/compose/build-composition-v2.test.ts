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

test("escapes feature_name in the title", () => {
  const p = { feature_name: 'A <b> & C', value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
    scenes: [{ id: "a", component: "statement", props: { headline: "H" }, narration: "n", duration: 3 }],
    youtube_metadata: { title: "", description: "", tags: [], chapters: [] } } as any;
  const dir = join(process.cwd(), "out/test-compose-v2-esc");
  const { indexPath } = buildCompositionV2(p, loadBrandTokens(), dir, {});
  const html = readFileSync(indexPath, "utf8");
  expect(html).toContain("<title>A &lt;b&gt; &amp; C</title>");
});

test("motion.autoZoom override applies zoom push to a non-slack scene", () => {
  const p = { feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
    scenes: [{ id: "a", component: "statement", props: { headline: "H" }, narration: "n", duration: 3, motion: { autoZoom: true } }],
    youtube_metadata: { title: "", description: "", tags: [], chapters: [] } } as any;
  const dir = join(process.cwd(), "out/test-compose-v2-zoom");
  const { indexPath } = buildCompositionV2(p, loadBrandTokens(), dir, {});
  const html = readFileSync(indexPath, "utf8");
  expect(html).toContain('data-ps="1.14"');
});
