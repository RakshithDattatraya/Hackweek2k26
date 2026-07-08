import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { validatePlanV3 } from "../content-director/plan-schema";
import { runGate } from "../qa/gate";
import sample from "../../fixtures/sample-plan.v3.json";

test("free-form fixture validates and passes non-render QA", () => {
  const plan = validatePlanV3(sample);
  const r = runGate(plan as any, loadBrandTokens(), "out/none", { skipRenderCheck: true });
  expect(r.ok).toBe(true);
  expect(plan.scenes.length).toBeGreaterThanOrEqual(3);
});
