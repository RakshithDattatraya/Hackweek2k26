import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { gap } from "./gap";

const t = loadBrandTokens();

test("gap renders both shores, chasm label, headline", () => {
  const html = gap.render(gap.propsSchema.parse({
    eyebrow: "The problem", headline: "The gap.",
    left: { icon: "✓", title: "Engineering", sub: "full context" },
    right: { icon: "?", title: "Sales", sub: "last to know" },
    chasmLabel: "weeks pass",
  }), t);
  expect(html).toContain("Engineering");
  expect(html).toContain("Sales");
  expect(html).toContain("weeks pass");
  expect(html).toContain("gapviz");
});
