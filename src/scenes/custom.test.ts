import { test, expect } from "bun:test";
import { scopeCss, renderCustomInner } from "./custom";

test("scopeCss prefixes simple selectors", () => {
  const out = scopeCss(".a{color:red} .b, .c{margin:0}", '[data-sid="x"]');
  expect(out).toContain('[data-sid="x"] .a');
  expect(out).toContain('[data-sid="x"] .b');
  expect(out).toContain('[data-sid="x"] .c');
});

test("scopeCss passes @keyframes through unscoped", () => {
  const out = scopeCss("@keyframes spin{from{opacity:0}to{opacity:1}}", '[data-sid="x"]');
  expect(out).toContain("@keyframes spin");
  expect(out).not.toContain('[data-sid="x"] from');
});

test("renderCustomInner returns html + scoped css", () => {
  const r = renderCustomInner({ id: "hero", html: "<h1>Hi</h1>", css: ".t{color:var(--uip-orange)}", narration: "n" } as any, '[data-sid="hero"]');
  expect(r.html).toBe("<h1>Hi</h1>");
  expect(r.css).toContain('[data-sid="hero"] .t');
});
