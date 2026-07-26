import { test, expect } from "bun:test";
import { renderReleaseOnePagerHtml } from "./render-release-html";

const t: any = { orange: "#FA4616", teal: "#0BA2B3", deepBlue: "#182126", white: "#FFF", fontHeadline: "Poppins", fontBody: "Inter" };
const plan: any = {
  release_name: "FinS", version: "v2604.195.0", theme: "Faster onboarding", audience: "internal",
  highlights: [{ title: "Public apps", value_line: "Share apps by URL", persona: "Ops", group: "New capabilities", source_pr: "https://x/pull/1" }],
  long_tail: [{ title: "Nit fix", source_pr: "https://x/pull/2" }],
  what_to_tell_customers: ["Lead with time-to-value."],
  notes_url: "https://x/releases/tag/v2604.195.0",
};

test("renders version, theme, highlights, and no video", () => {
  const h = renderReleaseOnePagerHtml(plan, t);
  expect(h).toContain("v2604.195.0");
  expect(h).toContain("Public apps");
  expect(h).toContain("New capabilities");
  expect(h).toContain("Lead with time-to-value.");
  expect(h).not.toContain("Watch the");
  expect(h).not.toContain("data:image/png");
});

test("escapes injected text", () => {
  const h = renderReleaseOnePagerHtml({ ...plan, theme: "<script>x</script>" }, t);
  expect(h).not.toContain("<script>x</script>");
  expect(h).toContain("&lt;script&gt;");
});
