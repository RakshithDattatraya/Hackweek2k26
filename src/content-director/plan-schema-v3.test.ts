import { test, expect } from "bun:test";
import { validatePlanV3, isCustomScene } from "./plan-schema";

const base = { feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } };

test("v3 accepts a custom scene and a component scene together", () => {
  const p = validatePlanV3({ ...base, scenes: [
    { id: "c1", html: "<h1>Hi</h1>", css: ".x{color:var(--uip-orange)}", motionScript: "tl.from(root,{autoAlpha:0},start)", narration: "hello" },
    { id: "s1", component: "cta", props: { headline: "Bye" }, narration: "bye" },
  ] });
  expect(p.scenes.length).toBe(2);
  expect(isCustomScene(p.scenes[0])).toBe(true);
  expect(isCustomScene(p.scenes[1])).toBe(false);
});

test("custom scene requires html", () => {
  expect(() => validatePlanV3({ ...base, scenes: [{ id: "c1", narration: "n" }] })).toThrow();
});

test("custom scene with invalid id format is rejected", () => {
  expect(() => validatePlanV3({ ...base, scenes: [
    { id: "bad id!", html: "<h1>Hi</h1>", narration: "n" },
  ] })).toThrow();
});
