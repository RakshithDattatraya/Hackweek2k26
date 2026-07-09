import { test, expect } from "bun:test";
import { validatePlanV3, isFootageScene, isCustomScene } from "./plan-schema";

const base = {
  feature_name: "F", value_prop: "v", persona: "p", when_to_use: "w", talking_points: ["t"],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
};

test("a footage scene parses and is detected by isFootageScene", () => {
  const plan = validatePlanV3({ ...base, scenes: [
    { id: "hook", html: "<div>x</div>", narration: "hi" },
    { id: "demo", footage: { narration: "Here's the feature in action." } },
  ]});
  expect(plan.scenes.length).toBe(2);
  const demo = plan.scenes[1] as any;
  expect(isFootageScene(demo)).toBe(true);
  expect(isCustomScene(demo)).toBe(false);
  expect(demo.footage.narration).toContain("action");
});

test("footage scene accepts optional clipPath", () => {
  const plan = validatePlanV3({ ...base, scenes: [
    { id: "demo", footage: { narration: "n", clipPath: "/tmp/x.mp4" } },
  ]});
  expect((plan.scenes[0] as any).footage.clipPath).toBe("/tmp/x.mp4");
});
