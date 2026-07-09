import { test, expect } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveChrome, htmlToPdf } from "./to-pdf";

test("resolveChrome returns a string or null without throwing", () => {
  const c = resolveChrome();
  expect(c === null || typeof c === "string").toBe(true);
});

test("htmlToPdf: produces a PDF when Chrome is available, false otherwise", () => {
  const dir = resolve(join(process.cwd(), "out/test-pdf")); mkdirSync(dir, { recursive: true });
  const html = join(dir, "p.html"), pdf = join(dir, "p.pdf");
  writeFileSync(html, "<!doctype html><html><body><h1>Hello one-pager</h1></body></html>");
  const ok = htmlToPdf(html, pdf);
  if (resolveChrome()) {
    expect(ok).toBe(true);
    expect(existsSync(pdf)).toBe(true);
    expect(statSync(pdf).size).toBeGreaterThan(1000);
  } else {
    expect(ok).toBe(false);
  }
  rmSync(dir, { recursive: true, force: true });
});
