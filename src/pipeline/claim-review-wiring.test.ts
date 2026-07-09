import { test, expect } from "bun:test";
import { rmSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildFromPlan } from "./build-plan";

test("buildFromPlan adds a claimReview section to qa-report.json", async () => {
  const dir = join(process.cwd(), "out/test-claimwire"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const plan = {
    feature_name: "F", value_prop: "v", persona: "p", when_to_use: "w", talking_points: ["t"],
    scenes: [
      { id: "a", html: "<div style='color:var(--uip-white)'>Alpha</div>", narration: "Alpha beat." },
      { id: "b", html: "<div style='color:var(--uip-white)'>Beta</div>", narration: "Beta beat." },
    ],
    youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
  };
  const planPath = join(process.cwd(), "out/test-claimwire-plan.json");
  writeFileSync(planPath, JSON.stringify(plan));
  await buildFromPlan(planPath, dir);
  const qa = JSON.parse(readFileSync(join(dir, "qa-report.json"), "utf8"));
  expect(typeof qa.ok).toBe("boolean");
  expect(Array.isArray(qa.findings)).toBe(true);
  expect(qa.claimReview).toBeDefined();
  expect(["pending", "reviewed"]).toContain(qa.claimReview.status);
  expect(Array.isArray(qa.claimReview.findings)).toBe(true);
  rmSync(dir, { recursive: true, force: true }); rmSync(planPath, { force: true });
}, 180000);
