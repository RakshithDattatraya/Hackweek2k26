import { test, expect } from "bun:test";
import { validatePlan } from "./plan-schema";
import sample from "../../fixtures/sample-plan.json";

test("golden fixture validates", () => {
  const plan = validatePlan(sample);
  expect(plan.scenes.length).toBeGreaterThan(0);
  expect(plan.feature_name.length).toBeGreaterThan(0);
});

test("scene with non-positive duration rejected", () => {
  const bad = structuredClone(sample) as any;
  bad.scenes[0].duration = 0;
  expect(() => validatePlan(bad)).toThrow();
});
