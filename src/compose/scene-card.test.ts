import { test, expect } from "bun:test";
import { sceneCard, escapeHtml } from "./scene-card";
import { loadBrandTokens } from "../brand/token-resolver";
import type { Scene } from "../content-director/plan-schema";

const tokens = loadBrandTokens();
const scene: Scene = { id: "s1", type: "hook", duration: 4, on_screen_text: "A & B", narration: "n", asset_requirements: [] };

test("emits mandatory timing attributes and escapes text", () => {
  const html = sceneCard(scene, 2, tokens);
  expect(html).toContain('class="clip');
  expect(html).toContain('data-start="2"');
  expect(html).toContain('data-duration="4"');
  expect(html).toContain('data-track-index="0"');
  expect(html).toContain("A &amp; B");
});

test("cta scene uses orange background", () => {
  const html = sceneCard({ ...scene, type: "cta" }, 0, tokens);
  expect(html.toUpperCase()).toContain("#FA4616");
});

test("escapeHtml handles all special chars", () => {
  expect(escapeHtml(`<a>&"`)).toBe("&lt;a&gt;&amp;&quot;");
});
