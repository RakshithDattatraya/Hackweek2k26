import { test, expect } from "bun:test";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildCompositionV2 } from "./build-composition-v2";
import { loadBrandTokens } from "../brand/token-resolver";

const outDir = join(process.cwd(), "out/test-compose-v3");
const plan = { feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  scenes: [
    { id: "hero", html: '<h1 class="anim big">Ship</h1>', css: ".big{color:var(--uip-orange)}",
      motionScript: "tl.from(root.querySelector('.big'),{autoAlpha:0,y:40},start+0.2)", narration: "n", duration: 4 },
    { id: "end", component: "cta", props: { headline: "Bye" }, narration: "n", duration: 3 },
  ],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } } as any;

test("v3 build: token vars, custom scene, scoped css, motion splice, component scene", () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const { indexPath } = buildCompositionV2(plan, loadBrandTokens(), outDir, {});
  const html = readFileSync(indexPath, "utf8");
  expect(html).toContain("--uip-orange:");                          // token var injected
  expect(html).toContain('data-sid="hero"');                        // custom scene present
  expect(html).toContain("Ship");
  expect(html).toContain('[data-sid="hero"] .big');                 // scoped css
  expect(html).toContain("(function(tl, root, start)");             // motion splice wrapper
  expect(html).toContain("Bye");                                    // component scene still works
});

test("v3 build: custom scene with motionScript gets data-own-motion and generic .anim stagger is guarded", () => {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  const { indexPath } = buildCompositionV2(plan, loadBrandTokens(), outDir, {});
  const html = readFileSync(indexPath, "utf8");
  const heroDivMatch = html.match(/<div class="[^"]*" data-sid="hero"[^>]*>/);
  expect(heroDivMatch).not.toBeNull();
  expect(heroDivMatch![0]).toContain('data-own-motion="1"');
  expect(html).toContain("!scene.dataset.ownMotion");
});

test("consecutive clip boundaries are contiguous (no rounding overlap)", () => {
  const p = { feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
    scenes: [
      { id: "a", html: "<h1>A</h1>", narration: "n", duration: 7.155 },
      { id: "b", html: "<h1>B</h1>", narration: "n", duration: 6.677 },
      { id: "c", html: "<h1>C</h1>", narration: "n", duration: 3.4 },
    ],
    youtube_metadata: { title: "", description: "", tags: [], chapters: [] } } as any;
  const dir = join(process.cwd(), "out/test-compose-v3-bounds");
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  const { indexPath } = buildCompositionV2(p, loadBrandTokens(), dir, {});
  const html = readFileSync(indexPath, "utf8");
  const starts = [...html.matchAll(/data-start="([0-9.]+)" data-duration="([0-9.]+)"/g)].map(m => [parseFloat(m[1]), parseFloat(m[2])]);
  expect(starts.length).toBe(3);
  // clip[i].start + clip[i].dur === clip[i+1].start (no overlap/gap)
  expect(starts[0][0] + starts[0][1]).toBeCloseTo(starts[1][0], 5);
  expect(starts[1][0] + starts[1][1]).toBeCloseTo(starts[2][0], 5);
});
