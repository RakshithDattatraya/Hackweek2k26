import { test, expect } from "bun:test";
import { render } from "./render";

test("render is a function taking a project dir and output path", () => {
  // Unit-level guard only; the real render runs in the Task 12 integration test.
  expect(typeof render).toBe("function");
  expect(render.length).toBe(2);
});
