import { test, expect } from "bun:test";
import { wordsToSrt } from "./captions-srt";

test("wordsToSrt emits numbered cues with SRT timestamps", () => {
  const words = [
    { text: "Hello", start: 0.0, end: 0.4 },
    { text: "there.", start: 0.5, end: 0.9 },
    { text: "Next", start: 1.0, end: 1.3 },
    { text: "line", start: 1.4, end: 1.7 },
  ];
  const srt = wordsToSrt(words);
  expect(srt).toContain("1\n00:00:00,000 --> 00:00:00,900\nHello there.");
  expect(srt).toContain("2\n00:00:01,000 --> 00:00:01,700\nNext line");
});

test("wordsToSrt groups long runs into multiple cues and formats mm:ss", () => {
  const words = Array.from({ length: 10 }, (_, i) => ({ text: `w${i}`, start: 60 + i, end: 60.5 + i }));
  const srt = wordsToSrt(words);
  expect(srt).toContain("00:01:00,000");
  expect(srt.trim().split(/\n\n/).length).toBeGreaterThanOrEqual(2);
});

test("empty input → empty string", () => {
  expect(wordsToSrt([])).toBe("");
});
