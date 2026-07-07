import { test, expect } from "bun:test";
import { promptToSourceContext } from "./manual-prompt";

test("wraps prompt as SourceContext", () => {
  const ctx = promptToSourceContext("New agentic feature.\nDetails here.");
  expect(ctx.kind).toBe("prompt");
  expect(ctx.title).toBe("New agentic feature.");
  expect(ctx.details).toContain("Details here.");
  expect(ctx.evidence).toContain("New agentic feature.\nDetails here.");
});

test("empty prompt throws", () => {
  expect(() => promptToSourceContext("   ")).toThrow();
});
