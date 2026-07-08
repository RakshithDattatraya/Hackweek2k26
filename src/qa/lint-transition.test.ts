import { test, expect } from "bun:test";
import { lintPlan } from "./lint";

const mk = (scene: any) => ({ feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  scenes: [scene], youtube_metadata: { title: "", description: "", tags: [], chapters: [] } } as any);

test("forbidden token in transitionOut is flagged with scene id", () => {
  const f = lintPlan(mk({ id: "t1", html: "<h1>x</h1>", narration: "n", transitionOut: "tl.to(root,{x:Math.random()},at)" }));
  expect(f.length).toBe(1);
  expect(f[0].sceneId).toBe("t1");
  expect(f[0].message).toContain("Math.random");
});

test("clean transitionOut passes", () => {
  expect(lintPlan(mk({ id: "t1", html: "<h1>x</h1>", narration: "n", transitionOut: "tl.to(root,{xPercent:-100},at)" }))).toEqual([]);
});
