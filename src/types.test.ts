import { test, expect } from "bun:test";
import { SourceContextSchema } from "./types";

test("valid source context parses", () => {
  const ctx = SourceContextSchema.parse({
    kind: "prompt",
    title: "Agentic automation",
    summary: "New feature",
    details: "Full text",
  });
  expect(ctx.kind).toBe("prompt");
  expect(ctx.evidence).toEqual([]); // defaulted
});

test("invalid kind rejected", () => {
  expect(() => SourceContextSchema.parse({ kind: "email", title: "x", summary: "x", details: "x" })).toThrow();
});
