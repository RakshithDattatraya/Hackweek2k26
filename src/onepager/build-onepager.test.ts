import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildOnePager } from "./build-onepager";
import { resolveChrome } from "./to-pdf";

const t: any = { orange: "#FA4616", teal: "#0BA2B3", deepBlue: "#182126", white: "#FFFFFF", fontHeadline: "Poppins", fontBody: "Inter" };
const plan: any = {
  feature_name: "Test Feature", value_prop: "Value.", persona: "SE",
  when_to_use: "When X.", talking_points: ["Point A"],
  scenes: [], youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
};

test("buildOnePager renders HTML+PDF and never embeds a video hero, even with a videoPath", () => {
  const dir = join(process.cwd(), "out/test-onepager"); mkdirSync(dir, { recursive: true });
  const vid = join(dir, "v.mp4");
  execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=10", "-t", "2", "-pix_fmt", "yuv420p", vid], { stdio: "ignore" });
  const r = buildOnePager(plan, t, join(dir, "op"), { videoPath: vid });
  expect(existsSync(r.htmlPath)).toBe(true);
  const html = readFileSync(r.htmlPath, "utf8");
  expect(html).toContain("Test Feature");
  expect(html).not.toContain("data:image/png;base64,"); // no video embed
  expect(html).not.toContain("Watch the");
  if (resolveChrome()) { expect(r.pdfPath).not.toBeNull(); expect(existsSync(r.pdfPath!)).toBe(true); }
  else { expect(r.pdfPath).toBeNull(); }
  rmSync(dir, { recursive: true, force: true });
}, 60000); // ffmpeg synth + Chrome PDF render exceed bun's 5s default

test("buildOnePager still emits HTML when no video is given (no hero block)", () => {
  const dir = join(process.cwd(), "out/test-onepager2"); mkdirSync(dir, { recursive: true });
  const r = buildOnePager(plan, t, join(dir, "op"), {});
  const html = readFileSync(r.htmlPath, "utf8");
  expect(html).toContain("Test Feature");
  expect(html).not.toContain("data:image/png;base64,");
  rmSync(dir, { recursive: true, force: true });
}, 30000);
