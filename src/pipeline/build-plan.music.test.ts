import { test, expect } from "bun:test";
import { sfxEventsFromPlan } from "./build-plan";

test("sfxEventsFromPlan emits a pop per scene and a whoosh between scenes", () => {
  const plan = { scenes: [
    { id: "a", duration: 3 },
    { id: "b", duration: 4 },
    { id: "c", duration: 2 },
  ] };
  const { events, totalDuration } = sfxEventsFromPlan(plan as any);
  expect(totalDuration).toBeCloseTo(9, 5);
  expect(events.filter((e) => e.kind === "pop").length).toBe(3);
  expect(events.filter((e) => e.kind === "whoosh").length).toBe(2);
  expect(events.find((e) => e.kind === "pop")!.at).toBeCloseTo(0.3, 5);
  expect(events.filter((e) => e.kind === "whoosh")[0].at).toBeCloseTo(3.0, 5);
});
