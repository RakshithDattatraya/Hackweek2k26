import { test, expect } from "bun:test";
import { classifySource } from "./source-router";

test("release URLs classify as release", () => {
  expect(classifySource("https://github.com/UiPath/fins-vertical-solution/releases/tag/v2604.195.0")).toBe("release");
  expect(classifySource("https://github.com/UiPath/fins-vertical-solution/releases#release-v2604.195.0")).toBe("release");
});

test("PR / merge URLs classify as feature", () => {
  expect(classifySource("https://github.com/UiPath/fins-vertical-solution/pull/1423")).toBe("feature");
  expect(classifySource("https://github.com/UiPath/fins-vertical-solution/commit/abc123")).toBe("feature");
});

test("unrecognized URLs are unknown", () => {
  expect(classifySource("https://github.com/UiPath/fins-vertical-solution")).toBe("unknown");
  expect(classifySource("not-a-url")).toBe("unknown");
});
