import { test, expect } from "bun:test";
import { validatePlanV2 } from "../content-director/plan-schema";
import { validateScenePlan } from "./registry";
import sample from "../../fixtures/sample-plan.v2.json";

test("director output fixture validates against schema + registry", () => {
  const plan = validatePlanV2(sample);
  expect(() => validateScenePlan(plan)).not.toThrow();
  expect(plan.scenes.length).toBeGreaterThanOrEqual(3);
});
