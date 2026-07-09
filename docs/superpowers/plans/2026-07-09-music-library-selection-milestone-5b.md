# Music Library + Director Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Director tags each video with a `music_mood`; the pipeline auto-selects a matching track from a curated CC0 library in `brand/audio/library/`, falling back to a dropped-in track then the synth pad.

**Architecture:** New leaf module `src/audio/library.ts` (load a manifest or infer from filenames; pick a track by mood). Wire it as the first choice in `build-plan.ts`'s music resolution. Add optional `music_mood` to the V3 plan schema. The existing loop/duck/mix path is unchanged.

**Tech Stack:** TypeScript, bun, zod, `node:fs`. No new deps.

## Global Constraints

- Deterministic: selection is pure — sort entries by `file` before choosing so order is FS-independent; no `Date.now`/`Math.random`/network.
- No new npm dependencies.
- Commercial-safe assets only (CC0 / Pixabay content license) — but track files are user-sourced; code must work with an empty library (synth fallback, no regression).

---

### Task 1: Library module (`src/audio/library.ts`)

**Files:**
- Create: `src/audio/library.ts`
- Test: `src/audio/library.test.ts`

**Interfaces:**
- Produces:
  - `type LibraryEntry = { file: string; mood: string; bpm?: number; note?: string }`
  - `loadLibrary(libraryDir: string): LibraryEntry[]`
  - `selectLibraryTrack(mood: string | undefined, libraryDir: string): string | null`

- [ ] **Step 1: Write the failing test** — `src/audio/library.test.ts`:

```ts
import { test, expect } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadLibrary, selectLibraryTrack } from "./library";

function tmp(name: string): string {
  const d = join(process.cwd(), "out", name); mkdirSync(d, { recursive: true }); return d;
}

test("loadLibrary reads library.json with paths resolved absolute", () => {
  const d = tmp("test-lib-json");
  writeFileSync(join(d, "a.mp3"), "x"); writeFileSync(join(d, "b.mp3"), "x");
  writeFileSync(join(d, "library.json"), JSON.stringify([
    { file: "a.mp3", mood: "uplifting", bpm: 90 },
    { file: "b.mp3", mood: "calm" },
  ]));
  const lib = loadLibrary(d);
  expect(lib.length).toBe(2);
  expect(lib[0].file).toBe(join(d, "a.mp3"));
  expect(lib[0].mood).toBe("uplifting");
  rmSync(d, { recursive: true, force: true });
});

test("loadLibrary infers mood from filename prefix when no manifest", () => {
  const d = tmp("test-lib-infer");
  writeFileSync(join(d, "uplifting-corporate.mp3"), "x");
  writeFileSync(join(d, "calm.wav"), "x");
  writeFileSync(join(d, "notes.txt"), "x"); // ignored (not audio)
  const lib = loadLibrary(d);
  const moods = lib.map((e) => e.mood).sort();
  expect(moods).toEqual(["calm", "uplifting"]);
  rmSync(d, { recursive: true, force: true });
});

test("selectLibraryTrack: mood match, unknown→first(sorted), empty→null", () => {
  const empty = tmp("test-lib-empty");
  expect(selectLibraryTrack("uplifting", empty)).toBeNull();
  const d = tmp("test-lib-sel");
  writeFileSync(join(d, "calm.mp3"), "x");
  writeFileSync(join(d, "uplifting.mp3"), "x");
  expect(selectLibraryTrack("UPLIFTING", d)).toBe(join(d, "uplifting.mp3")); // case-insensitive
  expect(selectLibraryTrack("nonexistent", d)).toBe(join(d, "calm.mp3"));    // first sorted by file
  expect(selectLibraryTrack(undefined, d)).toBe(join(d, "calm.mp3"));
  rmSync(empty, { recursive: true, force: true }); rmSync(d, { recursive: true, force: true });
});

test("loadLibrary skips manifest entries whose file is missing", () => {
  const d = tmp("test-lib-missing");
  writeFileSync(join(d, "real.mp3"), "x");
  writeFileSync(join(d, "library.json"), JSON.stringify([
    { file: "real.mp3", mood: "calm" },
    { file: "ghost.mp3", mood: "energetic" },
  ]));
  const lib = loadLibrary(d);
  expect(lib.length).toBe(1);
  expect(lib[0].mood).toBe("calm");
  rmSync(d, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test src/audio/library.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/audio/library.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify pass** — `bun test src/audio/library.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/library.ts src/audio/library.test.ts
git commit -m "feat: music library loader + mood-based track selection"
```

---

### Task 2: Schema field + pipeline wiring + assets/docs

**Files:**
- Modify: `src/content-director/plan-schema.ts` (add `music_mood` to V3)
- Modify: `src/pipeline/build-plan.ts` (prefer library selection)
- Modify: `.claude/skills/enablement-video/SKILL.md` (document `music_mood`)
- Modify: `demo/feature-video.v3.json` (add `"music_mood": "uplifting"`)
- Create: `brand/audio/library/.gitkeep`, `brand/audio/library/README.md`
- Test: `src/content-director/music-mood.test.ts`

**Interfaces:**
- Consumes: `selectLibraryTrack` (Task 1); existing `resolveOrSynthMusic`.

- [ ] **Step 1: Write the failing test** — `src/content-director/music-mood.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify fail** — `bun test src/content-director/music-mood.test.ts` → FAIL (music_mood stripped/undefined on the second assertion, since zod drops unknown keys).

- [ ] **Step 3a: Add the schema field.** In `src/content-director/plan-schema.ts`, in `VideoPlanV3Schema` (the `z.object({...})` starting near line 92), add this field alongside the others (e.g. after `talking_points`):

```ts
  music_mood: z.string().optional(),
```

- [ ] **Step 3b: Wire selection into the pipeline.** In `src/pipeline/build-plan.ts`:

Add import near the other audio imports:
```ts
import { selectLibraryTrack } from "../audio/library";
```

Find the line that currently computes `musicPath` (it calls `resolveOrSynthMusic(...)`). Replace that single line with:
```ts
  const libTrack = selectLibraryTrack((plan as any).music_mood, join(process.cwd(), "brand/audio/library"));
  const musicPath = noMusic ? null : (libTrack ?? resolveOrSynthMusic(join(process.cwd(), "brand/audio"), join(audioOut, "music-bed.wav"), totalDuration));
```
(`plan` is the validated V3 plan already in scope; `noMusic`, `audioOut`, `totalDuration` are the existing locals from the Milestone-5-part-1 block.)

- [ ] **Step 4: Run to verify pass** — `bun test src/content-director/music-mood.test.ts` → PASS.

- [ ] **Step 5: Add the dogfood mood.** In `demo/feature-video.v3.json`, add a top-level field (e.g. right after `"talking_points": [...],`):
```json
  "music_mood": "uplifting",
```

- [ ] **Step 6: Document for the director.** In `.claude/skills/enablement-video/SKILL.md`, add a short note (in the "Authoring a scene / plan" area) — verbatim:

```markdown
- `music_mood` (optional, plan-level): set the video's musical tone so the pipeline
  auto-selects a matching bed from `brand/audio/library/`. Allowed:
  `uplifting | calm | energetic | corporate | serious`. Pick the one that fits the
  video's energy (e.g. an upbeat pitch → `uplifting`). If the library is empty the
  pipeline falls back to a synthesized pad automatically.
```

- [ ] **Step 7: Create the library folder + shopping-list README.**

`brand/audio/library/.gitkeep` — empty.

`brand/audio/library/README.md`:
```markdown
# brand/audio/library — curated background-music library

The pipeline auto-selects a track from here based on the plan's `music_mood`. Source
these **once** (CC0 / royalty-free, commercial-safe) and drop them in. Empty = the
pipeline uses a synthesized fallback pad.

## Filename convention (no manifest needed)
Name each file `<mood>-<title>.mp3` (or `.wav`/`.m4a`). The mood is the part before the
first `-`. Example: `uplifting-sunrise.mp3` → mood `uplifting`.

## Moods to fill
- `uplifting` — warm, optimistic, gently building
- `calm` — soft, minimal, reflective
- `energetic` — driving, modern, tech-forward (still no heavy drums)
- `corporate` — neutral, professional underscore
- `serious` — restrained, weighty (for cautionary/positioning beats)

## Where to get them (recommended: Pixabay Music — CC0, no attribution, commercial-OK)
Search briefs on https://pixabay.com/music/ :
- uplifting: "uplifting corporate ambient" / "inspiring background"
- calm: "calm ambient minimal" / "soft piano background"
- energetic: "energetic technology corporate" / "modern upbeat"
- corporate: "corporate underscore neutral" / "background presentation"
- serious: "cinematic ambient serious" / "reflective underscore"
Pick tracks with NO vocals and minimal percussion (they must sit under narration).

## Optional explicit manifest (`library.json`)
Instead of the filename convention:
```json
[
  { "file": "sunrise.mp3", "mood": "uplifting", "bpm": 90, "note": "warm build" },
  { "file": "stillness.mp3", "mood": "calm" }
]
```
```

- [ ] **Step 8: Regression check** — run the audio + schema suites (fast, no full render):
```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use stable
bun test src/audio/ src/content-director/
```
Expected: all pass (music/sfx/mix/library + schema tests). With an empty library, pipeline behavior is unchanged (synth fallback) — no full render required for this task.

- [ ] **Step 9: Commit**

```bash
git add src/content-director/plan-schema.ts src/content-director/music-mood.test.ts src/pipeline/build-plan.ts .claude/skills/enablement-video/SKILL.md demo/feature-video.v3.json brand/audio/library/.gitkeep brand/audio/library/README.md
git commit -m "feat: wire mood-based music library selection into pipeline + director"
```

---

## Self-Review

- **Spec coverage:** library.ts loader+selector (Task 1); schema field, pipeline wiring, director doc, dogfood mood, library folder+shopping list (Task 2). All spec sections covered.
- **Placeholders:** none — full code/content in every step.
- **Type consistency:** `selectLibraryTrack(mood, dir)` signature matches definition and call site; `LibraryEntry` used only internally; `music_mood` optional string added to V3 and read as `(plan as any).music_mood`.
- **Determinism:** `loadLibrary` sorts by `file`; selection is pure; chosen file feeds the existing deterministic mix. No time/random/network.
