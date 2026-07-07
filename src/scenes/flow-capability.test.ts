import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { flow } from "./flow";
import { capability } from "./capability";

const t = loadBrandTokens();

test("flow renders nodes with arrows between", () => {
  const html = flow.render(flow.propsSchema.parse({ eyebrow: "How it works", nodes: [{ icon: "📥", label: "Ingest" }, { icon: "⚙️", label: "Render" }] }), t);
  expect(html).toContain("Ingest");
  expect(html).toContain("Render");
  expect(html).toContain("arrow");
  expect((html.match(/class="node/g) || []).length).toBe(2);
});

test("capability renders items with icons", () => {
  const html = capability.render(capability.propsSchema.parse({ eyebrow: "Caps", items: [{ icon: "🎬", title: "Directors", desc: "two of them" }] }), t);
  expect(html).toContain("Directors");
  expect(html).toContain("two of them");
});
