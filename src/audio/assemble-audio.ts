import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { VideoPlan } from "../content-director/plan-schema";
import type { SpeechSynthesizer } from "./tts";

export function wavDuration(path: string): number {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path,
  ]).toString().trim();
  return parseFloat(out);
}

export function synthesizePlanAudio(
  plan: VideoPlan,
  synth: SpeechSynthesizer,
  audioDir: string,
  pad = 0.6,
): { planWithTiming: VideoPlan; combinedWav: string } {
  audioDir = resolve(audioDir);
  const paddedFiles: string[] = [];

  const scenes = plan.scenes.map((s, i) => {
    const raw = join(audioDir, `scene-${i}.wav`);
    synth.synthesize(s.narration, raw);
    const duration = Math.max(wavDuration(raw) + pad, 2);

    // pad this clip with trailing silence to exactly `duration` so audio aligns to scene windows
    const padded = join(audioDir, `scene-${i}-pad.wav`);
    execFileSync("ffmpeg", ["-y", "-i", raw, "-af", "apad", "-t", duration.toFixed(3), "-ar", "44100", "-ac", "2", padded], { stdio: "ignore" });
    paddedFiles.push(padded);

    return { ...s, duration };
  });

  const listFile = join(audioDir, "concat.txt");
  writeFileSync(listFile, paddedFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
  const combinedWav = join(audioDir, "vo.wav");
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", combinedWav], { stdio: "ignore" });

  return { planWithTiming: { ...plan, scenes }, combinedWav };
}
