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
