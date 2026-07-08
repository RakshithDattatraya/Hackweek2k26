import { test, expect } from "bun:test";
import { parseHyperframesIssues } from "./render-check";

test("clean output yields no findings", () => {
  expect(parseHyperframesIssues("✓ all checks passed\n✓ no missing assets")).toEqual([]);
});

test("errors/missing/overflow become findings", () => {
  const f = parseHyperframesIssues("✗ JS error: foo is not defined\nmissing asset: audio/x.wav\nelement overflow on frame 12");
  expect(f.length).toBe(3);
  expect(f.every((x) => x.check === "render-check")).toBe(true);
});
