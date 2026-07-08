import { test, expect } from "bun:test";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildCompositionV2 } from "./build-composition-v2";
import { loadBrandTokens } from "../brand/token-resolver";

const outDir = join(process.cwd(), "out/test-compose-v4");
const plan = { feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  scenes: [
    { id: "a", html: "<h1>A</h1>", narration: "n", duration: 4, transitionOut: "tl.to(root,{xPercent:-100},at)", transitionOverlap: 0.6 },
    { id: "b", html: "<h1>B</h1>", narration: "n", duration: 3 },
  ],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } } as any;

test("transitions: overlap tail, alternating tracks, z-index, splice, caption band", () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const { indexPath } = buildCompositionV2(plan, loadBrandTokens(), outDir, {});
  const html = readFileSync(indexPath, "utf8");
  // scene a: start 0, content dur 4, +0.6 overlap → data-duration 4.60; scene b: 3.00 (last, no overlap)
  expect(html).toContain('data-sid="a"');
  expect(html).toMatch(/data-sid="a"[^>]*data-duration="4.60"/);
  expect(html).toMatch(/data-sid="b"[^>]*data-duration="3.00"/);
  // alternating tracks
  expect(html).toMatch(/data-sid="a"[^>]*data-track-index="0"/);
  expect(html).toMatch(/data-sid="b"[^>]*data-track-index="1"/);
  // z-index by order
  expect(html).toMatch(/data-sid="b"[^>]*z-index:1/);
  // transitionOut spliced at content-end (a ends at 4.00)
  expect(html).toContain("(function(tl, root, at)");
  expect(html).toContain("xPercent:-100");
  // caption safe-band scrim present
  expect(html).toContain("capscrim");
});
