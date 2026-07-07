import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { slack } from "./slack";

const t = loadBrandTokens();

test("slack renders header/messages, allowlists <b>, escapes the rest", () => {
  const html = slack.render(slack.propsSchema.parse({
    channel: "sales-help", members: 12,
    messages: [{ color: "#E01E5A", initials: "PS", name: "Priya", time: "9:41 AM", text: "a <b>bold</b> claim & <script>x</script>" }],
  }), t);
  expect(html).toContain("# sales-help");
  expect(html).toContain("12 members");
  expect(html).toContain("Priya");
  expect(html).toContain('class="anim srow"');
  expect(html).toContain("#E01E5A");
  expect(html).toContain("<b>bold</b>");      // allowlisted bold preserved
  expect(html).toContain("&amp;");             // ampersand escaped
  expect(html).toContain("&lt;script&gt;");    // script tag escaped
  expect(html).not.toContain("<script>");      // never raw
});
