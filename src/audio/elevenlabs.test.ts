import { test, expect } from "bun:test";
import { writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { elevenBody, getElevenKey, hasElevenLabs } from "./elevenlabs";

test("elevenBody builds a valid TTS request with expressive voice_settings", () => {
  const b = JSON.parse(elevenBody("Hello there."));
  expect(b.text).toBe("Hello there.");
  expect(b.model_id).toBe("eleven_multilingual_v2");
  expect(b.voice_settings.use_speaker_boost).toBe(true);
  expect(b.voice_settings.stability).toBeGreaterThanOrEqual(0);
  expect(b.voice_settings.stability).toBeLessThanOrEqual(1);
  expect(b.voice_settings.style).toBeGreaterThan(0); // expression on
});

test("getElevenKey reads a local .elevenlabs.key file when env is unset", () => {
  const dir = join(process.cwd(), "out/test-eleven");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".elevenlabs.key"), "  sk-test-123  \n");
  const prev = process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  try {
    expect(getElevenKey(dir)).toBe("sk-test-123"); // trimmed
    expect(hasElevenLabs(dir)).toBe(true);
    // a directory without the file and without env → null
    const empty = join(process.cwd(), "out/test-eleven-empty");
    mkdirSync(empty, { recursive: true });
    if (existsSync(join(empty, ".elevenlabs.key"))) rmSync(join(empty, ".elevenlabs.key"));
    expect(getElevenKey(empty)).toBeNull();
    expect(hasElevenLabs(empty)).toBe(false);
  } finally {
    if (prev !== undefined) process.env.ELEVENLABS_API_KEY = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("env key takes precedence over file", () => {
  const dir = join(process.cwd(), "out/test-eleven2");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".elevenlabs.key"), "from-file");
  const prev = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "from-env";
  try {
    expect(getElevenKey(dir)).toBe("from-env");
  } finally {
    if (prev === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
