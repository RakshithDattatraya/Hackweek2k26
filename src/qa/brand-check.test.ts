import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { brandCheck } from "./brand-check";

const t = loadBrandTokens();
const mk = (html: string, css = "") => ({ feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  scenes: [{ id: "c1", html, css, narration: "n" }],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } } as any);

test("var(--uip-*) usage passes", () => {
  expect(brandCheck(mk('<h1 style="color:var(--uip-orange)">x</h1>'), t)).toEqual([]);
});

test("on-palette hex passes, off-palette hex is flagged", () => {
  expect(brandCheck(mk("", ".a{color:#FA4616}"), t)).toEqual([]);      // Robotic Orange, on-palette
  const f = brandCheck(mk("", ".a{color:#ff00ff}"), t);                 // magenta, off-palette
  expect(f.length).toBe(1);
  expect(f[0].sceneId).toBe("c1");
});
