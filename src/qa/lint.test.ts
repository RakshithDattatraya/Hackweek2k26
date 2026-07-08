import { test, expect } from "bun:test";
import { lintPlan } from "./lint";

const mk = (motionScript: string) => ({ feature_name: "T", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  scenes: [{ id: "c1", html: "<h1>x</h1>", motionScript, narration: "n" }],
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } } as any);

test("clean GSAP motionScript passes", () => {
  expect(lintPlan(mk("tl.from(root,{autoAlpha:0,y:40,stagger:0.2},start)"))).toEqual([]);
});

test("Math.random is flagged with scene id", () => {
  const f = lintPlan(mk("tl.to(root,{x:Math.random()*10},start)"));
  expect(f.length).toBe(1);
  expect(f[0].sceneId).toBe("c1");
  expect(f[0].message).toContain("Math.random");
});

test("Date.now and fetch are flagged", () => {
  expect(lintPlan(mk("const t=Date.now(); fetch('/x')")).length).toBeGreaterThanOrEqual(1);
});
