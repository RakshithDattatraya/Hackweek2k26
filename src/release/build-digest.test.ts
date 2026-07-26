import { test, expect } from "bun:test";
import { buildDigest } from "./build-digest";

const plan: any = {
  release_name: "FinS", version: "v2604.195.0", theme: "Faster onboarding", audience: "internal",
  highlights: [{ title: "Public apps", value_line: "Share apps by URL", persona: "Ops", group: "New capabilities", source_pr: "https://x/pull/1" }],
  long_tail: [], what_to_tell_customers: ["Lead with time-to-value."],
  notes_url: "https://x/releases/tag/v2604.195.0",
};

test("slack digest names the release and top highlight", () => {
  const d = buildDigest(plan, { onepagerUrl: "https://bucket/op.pdf" });
  expect(d.slackMarkdown).toContain("v2604.195.0");
  expect(d.slackMarkdown).toContain("Public apps");
  expect(d.slackMarkdown).toContain("https://bucket/op.pdf");
});

test("confluence html escapes and includes highlights", () => {
  const d = buildDigest({ ...plan, theme: "<b>x</b>" });
  expect(d.confluenceHtml).toContain("&lt;b&gt;");
  expect(d.confluenceHtml).toContain("Public apps");
});
