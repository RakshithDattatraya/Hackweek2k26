# Music Library + Director Selection — Design Spec

**Date:** 2026-07-09
**Sub-project:** Audio polish (Milestone 5, part 2 of 3)
**Status:** Approved design → ready for implementation plan

## Goal

Replace the synthesized ambient pad with a **dynamically selected** real track: the
content director tags each video with a mood, and the pipeline auto-picks a matching
track from a small curated CC0 library. Zero per-video file input, commercial-safe,
free, deterministic. Falls back gracefully so nothing breaks when the library is empty.

## Why

Truly free per-video music *generation* is not commercial-safe (ElevenLabs Music is
paid; MusicGen weights are CC-BY-NC). A curated CC0 library sourced **once** + director
selection gives the "dynamic, no per-video input" feel without generation cost or
licensing risk.

## Architecture

Extends the Milestone-5-part-1 audio subsystem. The mix stage is unchanged — this only
changes *which file* becomes the music bed before it is looped/ducked/mixed.

**Selection priority (build time):**
1. `music_mood` on the plan + a matching track in `brand/audio/library/` → use it.
2. else a single track dropped directly in `brand/audio/` (existing behavior) → use it.
3. else the synthesized pad (existing fallback).

### New unit

**`src/audio/library.ts`**
- `type LibraryEntry = { file: string; mood: string; bpm?: number; note?: string }`
  (`file` = absolute path.)
- `loadLibrary(libraryDir: string): LibraryEntry[]` —
  - If `libraryDir/library.json` exists: parse `[{ file, mood, bpm?, note? }]`, resolve
    each `file` relative to `libraryDir`.
  - Else scan `libraryDir` for `*.mp3`/`*.wav`/`*.m4a` (ignore dotfiles) and infer
    `mood` = the filename (sans extension), lowercased, up to the first `-` or `_`
    (e.g. `uplifting-corporate.mp3` → `"uplifting"`, `calm.mp3` → `"calm"`).
  - Missing dir → `[]`.
- `selectLibraryTrack(mood: string | undefined, libraryDir: string): string | null` —
  - `entries = loadLibrary(libraryDir)`; if empty → `null`.
  - If `mood` given and some entry's `mood` matches (case-insensitive, trimmed) → that
    entry's `file`.
  - Else (no mood, or no match) → the first entry's `file` (deterministic: entries are
    sorted by `file` before selecting so order is stable regardless of FS order).

### Schema change

Add optional `music_mood: z.string().optional()` to `VideoPlanV3Schema` (top level).
(Leave V1/V2 untouched — the pipeline validates V3.)

### Wiring (`src/pipeline/build-plan.ts`)

Where `musicPath` is currently computed, prefer a library selection first:

```ts
const libTrack = selectLibraryTrack((plan as any).music_mood, join(process.cwd(), "brand/audio/library"));
const musicPath = noMusic ? null : (libTrack ?? resolveOrSynthMusic(join(process.cwd(), "brand/audio"), join(audioOut, "music-bed.wav"), totalDuration));
```

`plan` (the validated V3 plan) is already in scope in `buildFromPlan`. Everything else
in the mix path is unchanged (a library track is a normal file → looped + ducked + mixed).

### Director + assets

- `.claude/skills/enablement-video/SKILL.md`: document `music_mood` (allowed values:
  `uplifting | calm | energetic | corporate | serious`) and that the director should set
  it to match the video's tone.
- `demo/feature-video.v3.json`: add `"music_mood": "uplifting"` (the pitch is upbeat).
- `brand/audio/library/README.md`: the shopping list (which moods, Pixabay Music search
  briefs, filename convention `mood-title.mp3`, optional `library.json` format).
- The actual CC0 track files are sourced by the user once (out of scope for code); the
  engine works with whatever is present and falls back to synth when empty.

## Error handling

- Malformed `library.json` → throw with the path (fail loud; it's author-controlled).
- Entry `file` that doesn't exist on disk → skip it (warn), don't crash selection.
- Empty library dir or missing dir → `[]` → selection returns `null` → synth fallback.

## Testing

- `library.test.ts`:
  - `loadLibrary` with a `library.json` → parsed entries with absolute `file`.
  - `loadLibrary` without manifest → mood inferred from filename prefix.
  - `selectLibraryTrack("uplifting", dir)` → the uplifting file; unknown mood → first
    (sorted) file; empty dir → `null`.
  - Nonexistent `file` entry is skipped, not fatal.
- `build-plan` wiring: a unit test that `selectLibraryTrack` is preferred — covered by
  library.test plus an assertion that `music_mood` parses on the V3 schema.
- Existing suite stays green; e2e render still `ok:true` (with an empty library it uses
  the synth fallback exactly as today — no behavioral regression until tracks are added).

## Out of scope

- Music generation (paid/licensing — decided against).
- Per-scene music changes; crossfading between tracks.
- Auditioning/scoring track quality (human ear).

## Global constraints (carried)

- Deterministic: selection is pure (sorted entries, no randomness); the chosen file is a
  static input to the existing deterministic mix. No `Date.now`/`Math.random`/network.
- No new npm deps. bun runtime, `node:fs` + existing audio modules.
- Commercial-safe assets only (CC0 / Pixabay content license).
