import { test, expect } from "bun:test";
import { validatePlanV3 } from "./plan-schema";

const base = { feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } };

test("custom scene accepts transitionOut + transitionOverlap", () => {
  const p = validatePlanV3({ ...base, scenes: [
    { id: "a", html: "<h1>A</h1>", narration: "n", transitionOut: "tl.to(root,{xPercent:-100},at)", transitionOverlap: 0.7 },
    { id: "b", html: "<h1>B</h1>", narration: "n" },
  ] });
  expect((p.scenes[0] as any).transitionOverlap).toBe(0.7);
});

test("component scene accepts transitionOut + transitionOverlap", () => {
  const p = validatePlanV3({ ...base, scenes: [
    { id: "s", component: "cta", props: { headline: "x" }, narration: "n", transitionOut: "tl.to(root,{autoAlpha:0},at)", transitionOverlap: 0.5 },
  ] });
  expect((p.scenes[0] as any).transitionOut).toContain("autoAlpha");
});

test("negative transitionOverlap is rejected", () => {
  expect(() => validatePlanV3({ ...base, scenes: [{ id: "a", html: "<h1>A</h1>", narration: "n", transitionOverlap: -1 }] })).toThrow();
});
