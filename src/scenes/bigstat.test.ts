import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { bigstat } from "./bigstat";

const t = loadBrandTokens();

test("bigstat renders number, unit, caption", () => {
  const html = bigstat.render(bigstat.propsSchema.parse({ eyebrow: "Impact", number: "10", unit: "×", caption: "faster enablement" }), t);
  expect(html).toContain("10");
  expect(html).toContain("×");
  expect(html).toContain("faster enablement");
  expect(html).toContain("bigstat-num");
});
