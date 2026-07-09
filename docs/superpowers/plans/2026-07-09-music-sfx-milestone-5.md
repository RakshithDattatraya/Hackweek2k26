# Music Bed + SFX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ducked, license-free (or swappable) background music bed plus tasteful transition/entrance SFX to the rendered enablement video, mixed under the existing VO.

**Architecture:** Insert one final-mix stage between the current loudnorm step and the composition. Three new ffmpeg-backed modules — `music.ts`, `sfx.ts`, `mix.ts` — produce `audio/final.wav`; the composition's `<audio>` element points at it instead of `vo-norm.wav`. All ffmpeg filter graphs are static (deterministic, build-time).

**Tech Stack:** TypeScript, bun, ffmpeg/ffprobe (already required). No new npm deps.

## Global Constraints

- Deterministic render: nothing reaching the composition/timeline may use `Date.now`, `Math.random`, `new Date(`, `fetch(`, or network. ffmpeg filter graphs run at build time and are allowed, but must contain no randomized/time-based values.
- bun runtime; use `execFileSync` from `node:child_process` (match existing audio modules).
- 44.1kHz stereo for intermediate wavs; the final mix is 48kHz stereo (matches `vo-norm.wav` finalize settings).
- No new npm dependencies.
- All new audio files land under the run's `audio/` output dir except the optional user track in `brand/audio/`.

---

### Task 1: Music bed module (`src/audio/music.ts`)

**Files:**
- Create: `src/audio/music.ts`
- Test: `src/audio/music.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `resolveMusicTrack(brandAudioDir: string): string | null`
  - `synthMusicBed(outPath: string, durationSec: number): void`
  - `resolveOrSynthMusic(brandAudioDir: string, outPath: string, durationSec: number): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/audio/music.test.ts
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveMusicTrack, synthMusicBed, resolveOrSynthMusic } from "./music";

function dur(path: string): number {
  return parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", path]).toString().trim());
}

test("synthMusicBed writes a wav of ~requested duration", () => {
  const dir = join(process.cwd(), "out/test-music"); mkdirSync(dir, { recursive: true });
  const out = join(dir, "bed.wav");
  synthMusicBed(out, 3);
  expect(existsSync(out)).toBe(true);
  expect(Math.abs(dur(out) - 3)).toBeLessThan(0.15);
  rmSync(dir, { recursive: true, force: true });
});

test("resolveMusicTrack: none → null, one → that file, many → throws", () => {
  const dir = join(process.cwd(), "out/test-music-res"); mkdirSync(dir, { recursive: true });
  expect(resolveMusicTrack(dir)).toBeNull();
  writeFileSync(join(dir, "track.mp3"), "x");
  writeFileSync(join(dir, "sfx-ignore.wav"), "x"); // sfx- prefix ignored
  expect(resolveMusicTrack(dir)).toBe(join(dir, "track.mp3"));
  writeFileSync(join(dir, "second.wav"), "x");
  expect(() => resolveMusicTrack(dir)).toThrow();
  rmSync(dir, { recursive: true, force: true });
});

test("resolveOrSynthMusic falls back to synth when no track present", () => {
  const dir = join(process.cwd(), "out/test-music-fb"); mkdirSync(dir, { recursive: true });
  const brand = join(dir, "brand-audio"); mkdirSync(brand, { recursive: true });
  const out = join(dir, "music-bed.wav");
  const used = resolveOrSynthMusic(brand, out, 2.5);
  expect(used).toBe(out);
  expect(Math.abs(dur(out) - 2.5)).toBeLessThan(0.15);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/audio/music.test.ts`
Expected: FAIL — cannot find module `./music`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/audio/music.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/audio/music.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/music.ts src/audio/music.test.ts
git commit -m "feat: music bed module — resolve dropped-in track or synth ambient pad"
```

---

### Task 2: SFX module (`src/audio/sfx.ts`)

**Files:**
- Create: `src/audio/sfx.ts`
- Test: `src/audio/sfx.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SfxEvent = { at: number; kind: "whoosh" | "pop" }`
  - `synthWhoosh(outPath: string): void`
  - `synthPop(outPath: string): void`
  - `buildSfxTrack(events: SfxEvent[], totalDurationSec: number, workDir: string, outPath: string): void`

- [ ] **Step 1: Write the failing test**

```ts
// src/audio/sfx.test.ts
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { synthWhoosh, synthPop, buildSfxTrack } from "./sfx";

function dur(path: string): number {
  return parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", path]).toString().trim());
}

test("synthWhoosh and synthPop produce non-empty wavs", () => {
  const dir = join(process.cwd(), "out/test-sfx1"); mkdirSync(dir, { recursive: true });
  const w = join(dir, "w.wav"), p = join(dir, "p.wav");
  synthWhoosh(w); synthPop(p);
  expect(statSync(w).size).toBeGreaterThan(1000);
  expect(statSync(p).size).toBeGreaterThan(500);
  rmSync(dir, { recursive: true, force: true });
});

test("buildSfxTrack places events onto a bed of total duration", () => {
  const dir = join(process.cwd(), "out/test-sfx2"); mkdirSync(dir, { recursive: true });
  const out = join(dir, "sfx.wav");
  buildSfxTrack([{ at: 1, kind: "pop" }, { at: 2.5, kind: "whoosh" }], 5, dir, out);
  expect(existsSync(out)).toBe(true);
  expect(Math.abs(dur(out) - 5)).toBeLessThan(0.15);
  rmSync(dir, { recursive: true, force: true });
});

test("buildSfxTrack with zero events → silent bed of total", () => {
  const dir = join(process.cwd(), "out/test-sfx3"); mkdirSync(dir, { recursive: true });
  const out = join(dir, "sfx.wav");
  buildSfxTrack([], 4, dir, out);
  expect(Math.abs(dur(out) - 4)).toBeLessThan(0.15);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/audio/sfx.test.ts`
Expected: FAIL — cannot find module `./sfx`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/audio/sfx.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/audio/sfx.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/sfx.ts src/audio/sfx.test.ts
git commit -m "feat: SFX module — synth whoosh/pop and place on a timed track"
```

---

### Task 3: Final mixer (`src/audio/mix.ts`)

**Files:**
- Create: `src/audio/mix.ts`
- Test: `src/audio/mix.test.ts`

**Interfaces:**
- Consumes: a VO wav (e.g. `vo-norm.wav`), optional music path, optional sfx path.
- Produces:
  - `mixFinalAudio(args: { voPath: string; musicPath: string | null; sfxPath: string | null; totalDurationSec: number; workDir: string; outPath: string; musicGainDb?: number }): void`

- [ ] **Step 1: Write the failing test**

```ts
// src/audio/mix.test.ts
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { mixFinalAudio } from "./mix";
import { synthMusicBed } from "./music";
import { buildSfxTrack } from "./sfx";

function dur(path: string): number {
  return parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", path]).toString().trim());
}
function hasAudio(path: string): boolean {
  return execFileSync("ffprobe", ["-v","error","-select_streams","a","-show_entries","stream=codec_type","-of","default=noprint_wrappers=1:nokey=1", path]).toString().trim() === "audio";
}
function makeVo(path: string, d: number) {
  execFileSync("ffmpeg", ["-y","-f","lavfi","-i",`sine=frequency=200:duration=${d}`,"-ar","48000","-ac","2", path], { stdio: "ignore" });
}

test("mixFinalAudio mixes VO + music + sfx to ~total with audio", () => {
  const dir = join(process.cwd(), "out/test-mix"); mkdirSync(dir, { recursive: true });
  const vo = join(dir, "vo.wav"), music = join(dir, "m.wav"), sfx = join(dir, "s.wav"), out = join(dir, "final.wav");
  makeVo(vo, 5); synthMusicBed(music, 3 /* shorter → must loop */); buildSfxTrack([{ at: 1, kind: "pop" }], 5, dir, sfx);
  mixFinalAudio({ voPath: vo, musicPath: music, sfxPath: sfx, totalDurationSec: 5, workDir: dir, outPath: out });
  expect(existsSync(out)).toBe(true);
  expect(hasAudio(out)).toBe(true);
  expect(Math.abs(dur(out) - 5)).toBeLessThan(0.2);
  rmSync(dir, { recursive: true, force: true });
});

test("mixFinalAudio with null music and null sfx passes VO through", () => {
  const dir = join(process.cwd(), "out/test-mix2"); mkdirSync(dir, { recursive: true });
  const vo = join(dir, "vo.wav"), out = join(dir, "final.wav");
  makeVo(vo, 4);
  mixFinalAudio({ voPath: vo, musicPath: null, sfxPath: null, totalDurationSec: 4, workDir: dir, outPath: out });
  expect(hasAudio(out)).toBe(true);
  expect(Math.abs(dur(out) - 4)).toBeLessThan(0.2);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/audio/mix.test.ts`
Expected: FAIL — cannot find module `./mix`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/audio/mix.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/audio/mix.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/mix.ts src/audio/mix.test.ts
git commit -m "feat: final audio mixer — loop+duck music under VO, mix SFX, loudnorm"
```

---

### Task 4: Wire into the pipeline + brand/audio dir

**Files:**
- Modify: `src/pipeline/build-plan.ts` (insert mix stage after loudnorm; change `audioRelPath`)
- Create: `brand/audio/.gitkeep`
- Create: `brand/audio/README.md`
- Test: `src/pipeline/build-plan.music.test.ts`

**Interfaces:**
- Consumes: `resolveOrSynthMusic` (Task 1), `buildSfxTrack` + `SfxEvent` (Task 2), `mixFinalAudio` (Task 3).
- Produces: `out/**/audio/final.wav`; composition `<audio>` now references `audio/final.wav`.

**Context:** In `src/pipeline/build-plan.ts`, `synthesizePlanAudio(...)` returns `{ planWithTiming }`; each `planWithTiming.scenes[i]` has a `duration`. The composition (`build-composition-v2.ts`) computes scene start/duration with `r2(n)=Math.round(n*100)/100` and a cumulative `bounds` array — replicate that here so SFX line up with scene windows. Currently the code does loudnorm into `audio/vo-norm.wav` and later calls `buildCompositionV2(..., { audioRelPath: "audio/vo-norm.wav", captionHtml })`. Captions must still transcribe from `vo-norm.wav`.

- [ ] **Step 1: Write the failing test**

```ts
// src/pipeline/build-plan.music.test.ts
import { test, expect } from "bun:test";
import { sfxEventsFromPlan } from "./build-plan";

test("sfxEventsFromPlan emits a pop per scene and a whoosh between scenes", () => {
  const plan = { scenes: [
    { id: "a", duration: 3 },
    { id: "b", duration: 4 },
    { id: "c", duration: 2 },
  ] };
  const { events, totalDuration } = sfxEventsFromPlan(plan as any);
  expect(totalDuration).toBeCloseTo(9, 5);
  // 3 pops (one per scene) + 2 whooshes (between the 3 scenes) = 5 events
  expect(events.filter((e) => e.kind === "pop").length).toBe(3);
  expect(events.filter((e) => e.kind === "whoosh").length).toBe(2);
  // first pop at scene A start + 0.3
  expect(events.find((e) => e.kind === "pop")!.at).toBeCloseTo(0.3, 5);
  // first whoosh at A content-end = 3.0
  expect(events.filter((e) => e.kind === "whoosh")[0].at).toBeCloseTo(3.0, 5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/pipeline/build-plan.music.test.ts`
Expected: FAIL — `sfxEventsFromPlan` is not exported.

- [ ] **Step 3: Add `sfxEventsFromPlan` and wire the mix stage**

In `src/pipeline/build-plan.ts`, add imports near the other audio imports:

```ts
import { resolveOrSynthMusic } from "../audio/music";
import { buildSfxTrack, type SfxEvent } from "../audio/sfx";
import { mixFinalAudio } from "../audio/mix";
```

Add this exported helper (top-level, e.g. below `pickSynthesizer`):

```ts
/** Derive SFX events + total duration from the timed plan, matching composition scene windows. */
export function sfxEventsFromPlan(plan: { scenes: { duration?: number }[] }): { events: SfxEvent[]; totalDuration: number } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const bounds: number[] = [0];
  for (const s of plan.scenes) bounds.push(bounds[bounds.length - 1] + (s.duration ?? 4));
  const events: SfxEvent[] = [];
  plan.scenes.forEach((_, i) => {
    const start = r2(bounds[i]);
    const dur = r2(bounds[i + 1]) - start;
    events.push({ at: start + 0.3, kind: "pop" });               // headline entrance
    if (i < plan.scenes.length - 1) events.push({ at: start + dur, kind: "whoosh" }); // transition
  });
  return { events, totalDuration: r2(bounds[bounds.length - 1]) };
}
```

In `buildFromPlan`, immediately AFTER the existing loudnorm line that writes `audio/vo-norm.wav`, insert:

```ts
  // Music bed + SFX → final mix (VO leads; music ducks under it).
  const audioOut = join(outDir, "audio");
  const { events, totalDuration } = sfxEventsFromPlan(planWithTiming as any);
  const noMusic = process.env.ENABLEMENT_NO_MUSIC === "1";
  const noSfx = process.env.ENABLEMENT_NO_SFX === "1";
  const musicPath = noMusic ? null : resolveOrSynthMusic(join(process.cwd(), "brand/audio"), join(audioOut, "music-bed.wav"), totalDuration);
  let sfxPath: string | null = null;
  if (!noSfx) { sfxPath = join(audioOut, "sfx.wav"); buildSfxTrack(events, totalDuration, audioOut, sfxPath); }
  const gainEnv = process.env.ENABLEMENT_MUSIC_GAIN_DB;
  mixFinalAudio({
    voPath: join(audioOut, "vo-norm.wav"),
    musicPath, sfxPath, totalDurationSec: totalDuration, workDir: audioOut,
    outPath: join(audioOut, "final.wav"),
    musicGainDb: gainEnv ? Number(gainEnv) : undefined,
  });
```

Then change the `buildCompositionV2` call's audio path from `"audio/vo-norm.wav"` to `"audio/final.wav"`:

```ts
  buildCompositionV2(planWithTiming as any, tokens, outDir, { audioRelPath: "audio/final.wav", captionHtml });
```

Leave the transcribe step untouched — it must keep reading `audio/vo-norm.wav`.

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `bun test src/pipeline/build-plan.music.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Create `brand/audio/` with docs**

`brand/audio/.gitkeep` — empty file.

`brand/audio/README.md`:

```markdown
# brand/audio

Optional background-music override. Drop **exactly one** royalty-free track here
(`.mp3`, `.wav`, or `.m4a`) and it replaces the synthesized ambient bed; it is
auto-looped and ducked under the voiceover. Leave this folder empty to use the
default synth pad.

Good CC0 / royalty-free sources: Pixabay Music, YouTube Audio Library, Free Music
Archive (CC0). Search brief: **"corporate ambient pad, ~80 BPM, minimal, no drums."**

Files prefixed `sfx-` are ignored (reserved for generated SFX).
```

- [ ] **Step 6: End-to-end sanity render**

Run:
```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use stable
export HYPERFRAMES_NODE_BIN="/Users/rakshithdattatrayahegde/.nvm/versions/node/v24.14.1/bin"
bun run src/pipeline/build-plan.ts demo/feature-video.v3.json
ffprobe -v error -select_streams a -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 out/latest-v2/renders/video.mp4
cat out/latest-v2/qa-report.json
ls -la out/latest-v2/audio/final.wav out/latest-v2/audio/music-bed.wav out/latest-v2/audio/sfx.wav
```
Expected: `codec_type=audio`, `qa-report.json` shows `"ok": true`, all three audio files exist.

> Note: this render uses ElevenLabs if `.elevenlabs.key` is present (with `ELEVENLABS_VOICE_ID`/`STYLE`/`STABILITY` if set); otherwise it falls back to Ava/`say`. Music+SFX are independent of the voice.

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/build-plan.ts src/pipeline/build-plan.music.test.ts brand/audio/.gitkeep brand/audio/README.md
git commit -m "feat: wire music bed + SFX final mix into the render pipeline"
```

---

## Self-Review

- **Spec coverage:** music.ts (Task 1), sfx.ts (Task 2), mix.ts (Task 3), pipeline wiring + brand/audio + ducking + env escape hatches + SFX timing (Task 4). All spec sections covered.
- **Placeholder scan:** none — every code step is complete.
- **Type consistency:** `SfxEvent` defined in Task 2, imported in Task 4; `resolveOrSynthMusic`/`buildSfxTrack`/`mixFinalAudio` signatures match their definitions and call sites; `sfxEventsFromPlan` returns `{ events, totalDuration }` used verbatim.
- **Determinism:** every ffmpeg graph is static (fixed freqs, fixed filter params); no time/random. Passes existing QA lint (which scopes to composition/motion, not audio, but the constraint holds).
