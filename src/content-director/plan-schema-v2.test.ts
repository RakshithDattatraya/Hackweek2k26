import { test, expect } from "bun:test";
import { validatePlanV2 } from "./plan-schema";

const good = {
  feature_name: "Test", value_prop: "v", persona: "AE", when_to_use: "w", talking_points: ["a"],
  scenes: [{ id: "s1", component: "statement", props: { headline: "Hi" }, narration: "Hello there." }],
  youtube_metadata: { title: "t", description: "d", tags: [], chapters: [] },
};

test("valid v2 plan parses and defaults props", () => {
  const p = validatePlanV2(good);
  expect(p.scenes[0].component).toBe("statement");
  expect(p.scenes[0].narration).toBe("Hello there.");
});

test("scene missing component is rejected", () => {
  const bad = structuredClone(good) as any;
  delete bad.scenes[0].component;
  expect(() => validatePlanV2(bad)).toThrow();
});

test("empty narration is rejected", () => {
  const bad = structuredClone(good) as any;
  bad.scenes[0].narration = "";
  expect(() => validatePlanV2(bad)).toThrow();
});
