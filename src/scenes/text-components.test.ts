import { test, expect } from "bun:test";
import { loadBrandTokens } from "../brand/token-resolver";
import { intro } from "./intro";
import { statement } from "./statement";
import { cta } from "./cta";

const t = loadBrandTokens();

test("statement renders headline with highlight and escapes", () => {
  const html = statement.render(statement.propsSchema.parse({ eyebrow: "The insight", headline: "A & B", highlight: "B", sub: "s" }), t);
  expect(html).toContain("The insight");
  expect(html).toContain("A &amp; B".replace("B", "")); // "A &amp; " present
  expect(html).toContain('class="anim"');
});

test("intro renders tagline + logo", () => {
  const html = intro.render(intro.propsSchema.parse({ tagline: "Automatically." }), t);
  expect(html).toContain("Automatically.");
  expect(html).toContain("assets/uipath-logo-orange.png");
});

test("cta renders headline", () => {
  const html = cta.render(cta.propsSchema.parse({ headline: "From merge to enablement." }), t);
  expect(html).toContain("From merge to enablement.");
  expect(html).toContain("ctacard");
});
