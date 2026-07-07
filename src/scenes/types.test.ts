import { test, expect } from "bun:test";
import { esc } from "./types";

test("esc escapes html-significant characters", () => {
  expect(esc(`<a>&"`)).toBe("&lt;a&gt;&amp;&quot;");
});
