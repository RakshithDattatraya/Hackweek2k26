import { test, expect } from "bun:test";
import { renderOnePagerHtml } from "./render-html";

const t: any = { orange: "#010203", teal: "#040506", deepBlue: "#070809", white: "#0a0b0c", fontHeadline: "Poppins", fontBody: "Inter" };
const plan: any = {
  feature_name: "Autopilot Guardrails",
  value_prop: "Ship agent actions safely.",
  persona: "Sales Engineering",
  when_to_use: "When a customer worries about agent safety.",
  talking_points: ["Leads with trust", "Answers the compliance objection"],
  scenes: [], youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
};

test("renders all plan content", () => {
  const h = renderOnePagerHtml(plan, t);
  expect(h).toContain("Autopilot Guardrails");
  expect(h).toContain("Ship agent actions safely.");
  expect(h).toContain("Sales Engineering");
  expect(h).toContain("When a customer worries about agent safety.");
  expect(h).toContain("Leads with trust");
  expect(h).toContain("Answers the compliance objection");
});

test("uses brand token colors", () => {
  const h = renderOnePagerHtml(plan, t);
  expect(h).toContain("#010203"); // orange
  expect(h).toContain("#040506"); // teal
  expect(h).toContain("#070809"); // deep blue
});

test("escapes injected plan text", () => {
  const h = renderOnePagerHtml({ ...plan, feature_name: "<script>x</script>" }, t);
  expect(h).not.toContain("<script>x</script>");
  expect(h).toContain("&lt;script&gt;");
});

test("hero block: omitted without data uri, present with it", () => {
  expect(renderOnePagerHtml(plan, t)).not.toContain('<img src="data:image/png');
  const h = renderOnePagerHtml(plan, t, { heroDataUri: "data:image/png;base64,AAAA", videoUrl: "https://x/v" });
  expect(h).toContain('<img src="data:image/png;base64,AAAA"');
  expect(h).toContain("https://x/v");
});
