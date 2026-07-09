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
  // Trim on the music AFTER normalization; gain is an offset applied on top of the
  // normalized level (default 0 → music sits ~7 dB under the -16 LUFS voice).
  const gain = args.musicGainDb ?? 0;

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
    // Normalize the bed to a known loudness (-23 LUFS) so its level is source-independent
    // (synth pad OR a dropped-in track), then apply the gain offset. It ends up ~7 dB under
    // the -16 LUFS voice — a present-but-subtle bed.
    chains.push(`[${mi}:a]atrim=0:${T},loudnorm=I=-23:TP=-2,volume=${gain}dB[m]`);
    // Gentle sidechain duck keyed by the VO: quick recovery so the bed stays audible between words.
    chains.push(`[m][0:a]sidechaincompress=threshold=0.05:ratio=4:attack=5:release=250[md]`);
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
