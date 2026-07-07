import { test, expect } from "bun:test";
import { generatePlan } from "./content-director";
import { promptToSourceContext } from "../ingest/manual-prompt";
import { validatePlan } from "./plan-schema";

test("generates a valid 5-section enablement plan from a prompt", () => {
  const ctx = promptToSourceContext("Agentic Document Understanding extracts data from any document and self-corrects low-confidence fields.");
  const plan = generatePlan(ctx);
  validatePlan(plan); // throws if invalid
  const types = plan.scenes.map((s) => s.type);
  expect(types).toEqual(["hook", "capability", "demo", "positioning", "cta"]);
  expect(plan.scenes.every((s) => s.narration.length > 0)).toBe(true);
  expect(plan.talking_points.length).toBeGreaterThanOrEqual(1);
});

test("narration only references provided context (no external feature names)", () => {
  const ctx = promptToSourceContext("Widget X speeds up invoices.");
  const plan = generatePlan(ctx);
  const joined = plan.scenes.map((s) => s.narration).join(" ");
  expect(joined).toContain("Widget X");
});
