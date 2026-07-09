import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPrContext, detectDemoVideo } from "./pr-context";

test("detectDemoVideo finds a committed video, else null", () => {
  const dir = join(process.cwd(), "out/test-prctx-v"); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "demo.mp4"), "x");
  expect(detectDemoVideo(["src/a.ts", "demo.mp4"], dir)).toBe(join(dir, "demo.mp4"));
  expect(detectDemoVideo(["src/a.ts", "README.md"], dir)).toBeNull();
  expect(detectDemoVideo(["ghost.mp4"], dir)).toBeNull(); // not on disk
  rmSync(dir, { recursive: true, force: true });
});

test("getPrContext reads branch + commit subjects from git", () => {
  const dir = join(process.cwd(), "out/test-prctx-g"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const g = (args: string[]) => execFileSync("git", args, { cwd: dir });
  g(["init", "-q"]); g(["config", "user.email", "t@t"]); g(["config", "user.name", "t"]);
  g(["checkout", "-q", "-b", "feature-x"]);
  writeFileSync(join(dir, "a.txt"), "hi"); g(["add", "."]); g(["commit", "-q", "-m", "feat: add thing"]);
  const ctx = getPrContext(dir, "main");
  expect(ctx.branch).toBe("feature-x");
  expect(ctx.headSha.length).toBeGreaterThan(6);
  expect(ctx.commits[0]).toContain("feat: add thing");
  expect(ctx.title).toContain("feat: add thing");
  rmSync(dir, { recursive: true, force: true });
});
