import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SpeechSynthesizer } from "./tts";

/**
 * ElevenLabs voiceover via the SpeechSynthesizer swap-seam.
 * Key is read from the ELEVENLABS_API_KEY env var, or a gitignored `.elevenlabs.key`
 * file at the repo root — NEVER hardcoded / pasted into source.
 * Voice + model + expression are env-configurable; defaults are tuned for a warm,
 * expressive narration.
 */

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — calm, warm narration (standard library voice)
const DEFAULT_MODEL_ID = "eleven_multilingual_v2"; // high-quality, expressive

export function getElevenKey(root: string = process.cwd()): string | null {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const f = join(root, ".elevenlabs.key");
  if (existsSync(f)) {
    const k = readFileSync(f, "utf8").trim();
    if (k) return k;
  }
  return null;
}

export function hasElevenLabs(root: string = process.cwd()): boolean {
  return getElevenKey(root) !== null;
}

/** Pure: build the ElevenLabs TTS request body (expression tuned via voice_settings). */
export function elevenBody(text: string): string {
  return JSON.stringify({
    text,
    model_id: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
    voice_settings: {
      stability: Number(process.env.ELEVENLABS_STABILITY ?? 0.4), // lower = more expressive/emotional
      similarity_boost: 0.8,
      style: Number(process.env.ELEVENLABS_STYLE ?? 0.45), // style exaggeration → warmth/expression
      use_speaker_boost: true,
    },
  });
}

export const elevenlabsSynthesizer: SpeechSynthesizer = {
  synthesize(text, outWavPath) {
    const key = getElevenKey();
    if (!key) throw new Error("ElevenLabs key not found (set ELEVENLABS_API_KEY or create .elevenlabs.key)");
    const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
    const mp3 = outWavPath.replace(/\.wav$/, ".mp3");
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
    try {
      execFileSync("curl", [
        "-sS", "--fail-with-body", "-X", "POST", url,
        "-H", `xi-api-key: ${key}`,
        "-H", "content-type: application/json",
        "-d", elevenBody(text),
        "-o", mp3,
      ], { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e: any) {
      const body = existsSync(mp3) ? readFileSync(mp3, "utf8").slice(0, 400) : (e.stderr?.toString() ?? "");
      throw new Error(`ElevenLabs TTS failed: ${body}`);
    }
    // convert mp3 → 44.1kHz stereo wav (same shape as the say/ava path)
    execFileSync("ffmpeg", ["-y", "-i", mp3, "-ar", "44100", "-ac", "2", outWavPath], { stdio: "ignore" });
  },
};
