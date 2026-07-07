import { test, expect } from "bun:test";
import { loadBrandTokens } from "./token-resolver";

test("loads UiPath primary colors from tokens file", () => {
  const t = loadBrandTokens();
  expect(t.orange.toUpperCase()).toBe("#FA4616");
  expect(t.teal.toUpperCase()).toBe("#0BA2B3");
  expect(t.deepBlue.toUpperCase()).toBe("#182126");
  expect(t.fontHeadline).toBe("Poppins");
  expect(t.white.toUpperCase()).toBe("#FFFFFF");
  expect(t.fontBody).toBe("Inter");
  expect(t.logoOrange).toBe("brand/logos/uipath-logo-orange.png");
});
