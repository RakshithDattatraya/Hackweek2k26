import { test, expect } from "bun:test";
import { validateReleasePlan } from "./release-plan-schema";

const good = {
  release_name: "FinS Vertical Solution", version: "v2604.195.0",
  theme: "Faster onboarding + compliance",
  audience: "internal",
  highlights: [{ title: "X", value_line: "Y", persona: "Ops", group: "New capabilities", source_pr: "https://github.com/o/r/pull/1" }],
  long_tail: [{ title: "Minor fix", source_pr: "https://github.com/o/r/pull/2" }],
  what_to_tell_customers: ["Lead with time-to-value."],
  notes_url: "https://github.com/o/r/releases/tag/v2604.195.0",
};

test("accepts a valid release plan", () => {
  expect(validateReleasePlan(good).version).toBe("v2604.195.0");
});

test("rejects a plan with no highlights", () => {
  expect(() => validateReleasePlan({ ...good, highlights: [] })).toThrow();
});

test("rejects an invalid group value", () => {
  const bad = { ...good, highlights: [{ ...good.highlights[0], group: "Random" }] };
  expect(() => validateReleasePlan(bad)).toThrow();
});
