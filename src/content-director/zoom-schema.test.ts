import { test, expect } from "bun:test";
import { validatePlanV3 } from "./plan-schema";

const base = {
  feature_name: "F", value_prop: "v", persona: "p", when_to_use: "w", talking_points: ["t"],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
};

test("footage scene accepts a zoom keyframe track", () => {
  const plan = validatePlanV3({ ...base, scenes: [
    { id: "demo", footage: { narration: "n", zoom: [ { at: 0, scale: 1 }, { at: 2, scale: 1.2, x: 0.8, y: 0.3, ease: "smooth" } ] } },
  ]});
  const z = (plan.scenes[0] as any).footage.zoom;
  expect(z.length).toBe(2);
  expect(z[1].scale).toBe(1.2);
  expect(z[1].x).toBe(0.8);
});

test("zoom scale < 1 is rejected", () => {
  expect(() => validatePlanV3({ ...base, scenes: [
    { id: "demo", footage: { narration: "n", zoom: [ { at: 0, scale: 0.5 } ] } },
  ]})).toThrow();
});

test("footage scene without zoom still parses", () => {
  const plan = validatePlanV3({ ...base, scenes: [ { id: "demo", footage: { narration: "n" } } ] });
  expect((plan.scenes[0] as any).footage.zoom).toBeUndefined();
});
