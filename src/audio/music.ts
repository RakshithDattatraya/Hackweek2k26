import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MUSIC_EXTS = [".mp3", ".wav", ".m4a"];

/** Return the single user-supplied music track in brandAudioDir, or null. Throws if >1. */
export function resolveMusicTrack(brandAudioDir: string): string | null {
  if (!existsSync(brandAudioDir)) return null;
  const candidates = readdirSync(brandAudioDir).filter((f) => {
    if (f.startsWith("sfx-") || f.startsWith(".")) return false;
    return MUSIC_EXTS.some((e) => f.toLowerCase().endsWith(e));
  });
  if (candidates.length === 0) return null;
  if (candidates.length > 1) {
    throw new Error(`Ambiguous music: ${candidates.length} tracks in ${brandAudioDir} (${candidates.join(", ")}). Leave exactly one.`);
  }
  return join(brandAudioDir, candidates[0]);
}

/**
 * Synthesize a subtle ambient pad (Am7: A2/E3/C4/G4) to outPath (44.1kHz stereo wav).
 * Static filter graph → deterministic.
 */
export function synthMusicBed(outPath: string, durationSec: number): void {
  const D = Math.max(1, durationSec);
  const fadeOut = Math.max(0, D - 2).toFixed(3);
  const freqs = [110, 164.81, 261.63, 392];
  const inputs = freqs.flatMap((f) => ["-f", "lavfi", "-i", `sine=frequency=${f}:duration=${D.toFixed(3)}`]);
  const filter =
    `[0][1][2][3]amix=inputs=4:normalize=1,` +
    `tremolo=f=0.15:d=0.4,lowpass=f=1200,aecho=0.8:0.9:120:0.25,` +
    `afade=t=in:st=0:d=2,afade=t=out:st=${fadeOut}:d=2,volume=1.6`;
  execFileSync("ffmpeg", ["-y", ...inputs, "-filter_complex", filter, "-ar", "44100", "-ac", "2", outPath], { stdio: "ignore" });
}

/** Use a real track if present in brandAudioDir, else synthesize a bed at outPath. Returns the path to use. */
export function resolveOrSynthMusic(brandAudioDir: string, outPath: string, durationSec: number): string {
  const track = resolveMusicTrack(brandAudioDir);
  if (track) return track;
  synthMusicBed(outPath, durationSec);
  return outPath;
}
