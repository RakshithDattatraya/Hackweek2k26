import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { runGate } from "./gate";

const t = loadBrandTokens();
const base = { feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } };

test("clean plan passes the gate (render-check skipped)", () => {
  const plan = { ...base, scenes: [{ id: "c1", html: '<h1 style="color:var(--uip-orange)">Hi</h1>', motionScript: "tl.from(root,{autoAlpha:0},start)", narration: "n" }] } as any;
  const r = runGate(plan, t, "out/none", { skipRenderCheck: true });
  expect(r.ok).toBe(true);
  expect(r.findings).toEqual([]);
});

test("determinism + brand violations both surface, gate fails", () => {
  const plan = { ...base, scenes: [{ id: "bad", html: '<h1 style="color:#ff00ff">Hi</h1>', motionScript: "tl.to(root,{x:Math.random()},start)", narration: "n" }] } as any;
  const r = runGate(plan, t, "out/none", { skipRenderCheck: true });
  expect(r.ok).toBe(false);
  expect(r.findings.some((f) => f.check === "determinism-lint")).toBe(true);
  expect(r.findings.some((f) => f.check === "brand-palette")).toBe(true);
});
