import { execFileSync } from "node:child_process";

/**
 * Mix VO with an optional (looped, ducked) music bed and an optional SFX track
 * into a 48kHz stereo, loudness-normalized final wav.
 * Music sidechain-ducks under the VO so narration always leads.
 * All-static filter graph → deterministic.
 */
export function mixFinalAudio(args: {
  voPath: string;
  musicPath: string | null;
  sfxPath: string | null;
  totalDurationSec: number;
  workDir: string;
  outPath: string;
  musicGainDb?: number;
}): void {
  const { voPath, musicPath, sfxPath, outPath } = args;
  const T = Math.max(0.1, args.totalDurationSec).toFixed(3);
  const gain = args.musicGainDb ?? -20;

  // No music and no sfx → normalize VO through to the final format.
  if (!musicPath && !sfxPath) {
    execFileSync("ffmpeg", ["-y", "-i", voPath, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", "-t", T, outPath], { stdio: "ignore" });
    return;
  }

  const inputs: string[] = ["-i", voPath]; // [0:a] = VO
  const chains: string[] = [];
  const mixLabels: string[] = ["[0:a]"];
  let idx = 1;

  if (musicPath) {
    inputs.push("-stream_loop", "-1", "-i", musicPath); // loop music infinitely
    const mi = idx++;
    chains.push(`[${mi}:a]atrim=0:${T},volume=${gain}dB[m]`);
    chains.push(`[m][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=200:release=800[md]`);
    mixLabels.push("[md]");
  }
  if (sfxPath) {
    inputs.push("-i", sfxPath);
    const si = idx++;
    mixLabels.push(`[${si}:a]`);
  }

  const filter =
    `${chains.join(";")}${chains.length ? ";" : ""}` +
    `${mixLabels.join("")}amix=inputs=${mixLabels.length}:normalize=0:duration=first,` +
    `loudnorm=I=-16:TP=-1.5:LRA=11[out]`;

  execFileSync("ffmpeg", ["-y", ...inputs, "-filter_complex", filter, "-map", "[out]", "-ar", "48000", "-ac", "2", "-t", T, outPath], { stdio: "ignore" });
}
