import { execFileSync } from "node:child_process";
import { join } from "node:path";

export type SfxEvent = { at: number; kind: "whoosh" | "pop" };

/** Soft filtered pink-noise sweep (~0.5s), 44.1kHz stereo. Static → deterministic. */
export function synthWhoosh(outPath: string): void {
  execFileSync("ffmpeg", ["-y",
    "-f", "lavfi", "-i", "anoisesrc=d=0.5:c=pink:a=0.5",
    "-af", "highpass=f=300,lowpass=f=6000,afade=t=in:st=0:d=0.08,afade=t=out:st=0.25:d=0.25,volume=0.5",
    "-ar", "44100", "-ac", "2", outPath], { stdio: "ignore" });
}

/** Short soft sine blip (~0.12s @ 660Hz), 44.1kHz stereo. Static → deterministic. */
export function synthPop(outPath: string): void {
  execFileSync("ffmpeg", ["-y",
    "-f", "lavfi", "-i", "sine=frequency=660:duration=0.12",
    "-af", "afade=t=out:st=0.02:d=0.1,volume=0.35",
    "-ar", "44100", "-ac", "2", outPath], { stdio: "ignore" });
}

/**
 * Synthesize the two one-shots once, place each event at its timestamp (adelay),
 * amix onto a silent bed of totalDurationSec → single 44.1kHz stereo wav.
 */
export function buildSfxTrack(events: SfxEvent[], totalDurationSec: number, workDir: string, outPath: string): void {
  const T = Math.max(0.1, totalDurationSec).toFixed(3);
  if (events.length === 0) {
    execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", T, "-ar", "44100", "-ac", "2", outPath], { stdio: "ignore" });
    return;
  }
  const whoosh = join(workDir, "sfx-whoosh.wav"), pop = join(workDir, "sfx-pop.wav");
  synthWhoosh(whoosh); synthPop(pop);

  // input 0 = silent bed; inputs 1..N = one per event
  const inputs: string[] = ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"];
  const chains: string[] = [];
  const mixLabels: string[] = ["[0]"];
  events.forEach((ev, i) => {
    inputs.push("-i", ev.kind === "whoosh" ? whoosh : pop);
    const ms = Math.max(0, Math.round(ev.at * 1000));
    chains.push(`[${i + 1}]adelay=${ms}|${ms}[e${i}]`);
    mixLabels.push(`[e${i}]`);
  });
  const filter = `${chains.join(";")};${mixLabels.join("")}amix=inputs=${mixLabels.length}:normalize=0[out]`;
  execFileSync("ffmpeg", ["-y", ...inputs, "-filter_complex", filter, "-map", "[out]", "-t", T, "-ar", "44100", "-ac", "2", outPath], { stdio: "ignore" });
}
