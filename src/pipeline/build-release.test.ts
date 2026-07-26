import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRelease } from "./build-release";

const plan: any = {
  release_name: "FinS", version: "v2604.195.0", theme: "Faster onboarding", audience: "internal",
  highlights: [{ title: "Public apps", value_line: "Share apps by URL", persona: "Ops", group: "New capabilities", source_pr: "https://x/pull/1" }],
  long_tail: [], what_to_tell_customers: ["Lead with time-to-value."],
  notes_url: "https://x/releases/tag/v2604.195.0",
};

test("writes one-pager html + both digests", () => {
  const dir = mkdtempSync(join(tmpdir(), "rel-"));
  const r = buildRelease(plan, dir);
  expect(readFileSync(r.onepagerHtml, "utf8")).toContain("v2604.195.0");
  expect(readFileSync(r.slackPath, "utf8")).toContain("Public apps");
  expect(readFileSync(r.confluencePath, "utf8")).toContain("Highlights");
}, 30000); // Chrome PDF render exceeds bun's 5s default (see build-onepager.test.ts)

test("rejects an invalid plan", () => {
  const dir = mkdtempSync(join(tmpdir(), "rel-"));
  expect(() => buildRelease({ ...plan, highlights: [] }, dir)).toThrow();
});
