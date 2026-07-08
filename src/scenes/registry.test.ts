import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { renderScene, validateScenePlan, SCENE_REGISTRY } from "./registry";

const t = loadBrandTokens();

test("registry has the expected components", () => {
  for (const name of ["intro", "slack", "statement", "gap", "flow", "capability", "bigstat", "cta"]) {
    expect(SCENE_REGISTRY[name]).toBeDefined();
  }
});

test("renderScene dispatches by component name", () => {
  const html = renderScene({ id: "s1", component: "statement", props: { headline: "Hi" }, narration: "n" } as any, t);
  expect(html).toContain("Hi");
});

test("renderScene throws on unknown component", () => {
  expect(() => renderScene({ id: "s1", component: "nope", props: {}, narration: "n" } as any, t)).toThrow(/unknown component/i);
});

test("validateScenePlan throws with scene id on bad props", () => {
  const plan = { scenes: [{ id: "sX", component: "slack", props: {}, narration: "n" }] } as any;
  expect(() => validateScenePlan(plan)).toThrow(/sX/);
});
