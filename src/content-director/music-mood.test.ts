import { test, expect } from "bun:test";
import { validatePlanV3 } from "./plan-schema";

const base = {
  feature_name: "F", value_prop: "v", persona: "p", when_to_use: "w",
  talking_points: ["t"],
  scenes: [{ id: "a", html: "<div>x</div>", narration: "hi" }],
  youtube_metadata: { title: "t", description: "d", tags: [], chapters: [] },
};

test("music_mood is optional and parses when present", () => {
  expect(validatePlanV3(base).music_mood).toBeUndefined();
  const withMood = validatePlanV3({ ...base, music_mood: "uplifting" });
  expect(withMood.music_mood).toBe("uplifting");
});
