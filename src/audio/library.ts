import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type LibraryEntry = { file: string; mood: string; bpm?: number; note?: string };

const AUDIO_EXTS = [".mp3", ".wav", ".m4a"];

/** Load the curated music library: a library.json manifest if present, else infer from filenames. */
export function loadLibrary(libraryDir: string): LibraryEntry[] {
  if (!existsSync(libraryDir)) return [];

  const manifest = join(libraryDir, "library.json");
  let entries: LibraryEntry[];
  if (existsSync(manifest)) {
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(manifest, "utf8")); }
    catch (e: any) { throw new Error(`Invalid library.json at ${manifest}: ${e.message}`); }
    if (!Array.isArray(raw)) throw new Error(`library.json must be an array of {file, mood}: ${manifest}`);
    entries = raw.map((r: any) => ({
      file: join(libraryDir, String(r.file)),
      mood: String(r.mood ?? "").toLowerCase().trim(),
      bpm: typeof r.bpm === "number" ? r.bpm : undefined,
      note: typeof r.note === "string" ? r.note : undefined,
    }));
  } else {
    entries = readdirSync(libraryDir)
      .filter((f) => !f.startsWith(".") && AUDIO_EXTS.some((e) => f.toLowerCase().endsWith(e)))
      .map((f) => {
        const base = f.replace(/\.[^.]+$/, "");
        const mood = base.toLowerCase().split(/[-_]/)[0];
        return { file: join(libraryDir, f), mood };
      });
  }
  // drop entries whose file is missing; sort by file for deterministic order
  return entries.filter((e) => existsSync(e.file)).sort((a, b) => a.file.localeCompare(b.file));
}

/** Pick a track path by mood (case-insensitive). Unknown/absent mood → first (sorted). Empty library → null. */
export function selectLibraryTrack(mood: string | undefined, libraryDir: string): string | null {
  const entries = loadLibrary(libraryDir);
  if (entries.length === 0) return null;
  if (mood) {
    const m = mood.toLowerCase().trim();
    const hit = entries.find((e) => e.mood === m);
    if (hit) return hit.file;
  }
  return entries[0].file;
}
