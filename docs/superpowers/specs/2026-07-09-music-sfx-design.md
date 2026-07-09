# Music Bed + SFX — Design Spec

**Date:** 2026-07-09
**Sub-project:** Audio polish (Milestone 5, part 1 of 3)
**Status:** Approved design → ready for implementation plan

## Goal

Add a ducked background music bed and tasteful transition/entrance SFX to the
rendered enablement video, lifting perceived production value without competing
with the voiceover. Deterministic, license-free by default, and swappable for a
real royalty-free track via a single file drop.

## Why (design rationale)

For narrated enablement, a subtle **tonal pad** beats a melodic track — melody
and rhythm fight the VO, but a soft evolving pad adds warmth and "premium feel."
That pad can be synthesized deterministically with ffmpeg (we control every
parameter, zero licensing). The VO always leads: music sidechain-ducks under
speech and swells back in the gaps.

## Architecture

The audio subsystem currently produces `audio/vo.wav` (concatenated per-scene
VO, silence-padded to scene windows) → `loudnorm` → `audio/vo-norm.wav`, which
the composition references as a single `<audio>` element on track index 2.

We insert a **final mix** stage between loudnorm and composition. The composition
change is one line: reference `audio/final.wav` instead of `audio/vo-norm.wav`.
All mixing is ffmpeg, invoked from the audio subsystem — fully deterministic
(static filter graphs, no `Date.now`/random).

```
vo.wav ──loudnorm──> vo-norm.wav ─┐
                                  ├─> mixFinalAudio ──> final.wav ──> composition <audio>
music bed (resolve/synth) ────────┤   (loop+trim music, sidechain-duck under VO,
sfx track (synth+place) ──────────┘    amix VO+music+sfx, loudnorm result)
```

### New units

**`src/audio/music.ts`** — the music bed.
- `resolveMusicTrack(brandAudioDir: string): string | null` — returns the path
  to a user-supplied track if exactly one `*.mp3`/`*.wav`/`*.m4a` file exists in
  `brand/audio/` (excluding files prefixed `sfx-`), else `null`.
- `synthMusicBed(outPath: string, durationSec: number): void` — generate a
  tasteful ambient pad to `outPath` (44.1kHz stereo wav) of `durationSec`.
  ffmpeg: layered sine tones forming a soft minor-9 chord (e.g. A2/E3/C4/G4),
  slow tremolo (`tremolo=f=0.15:d=0.4`), low-pass (`lowpass=f=1200`), gentle
  reverb (`aecho=0.8:0.9:120:0.25`), faded in/out. All params static.
- `resolveOrSynthMusic(brandAudioDir, outPath, durationSec): string` — resolve a
  real track (loop/trim handled downstream) else synth; returns the path used.

**`src/audio/sfx.ts`** — synthesized SFX + placement.
- `synthWhoosh(outPath: string): void` — filtered white-noise sweep (~0.5s):
  `anoisesrc` → `highpass`/`lowpass` sweep envelope → fade. Static.
- `synthPop(outPath: string): void` — short soft sine blip (~0.12s, ~660Hz) with
  fast fade. Static.
- `buildSfxTrack(events: SfxEvent[], totalDurationSec: number, workDir: string, outPath: string): void`
  where `SfxEvent = { at: number; kind: "whoosh" | "pop" }`. Synthesizes the two
  base one-shots once, then places each event at its timestamp via `adelay`, and
  `amix`es them onto a silent bed of `totalDurationSec`. Result: one stereo wav.

**`src/audio/mix.ts`** — the final mixer.
- `mixFinalAudio(args: { voPath: string; musicPath: string | null; sfxPath: string | null; totalDurationSec: number; workDir: string; outPath: string }): void`
  - Music: loop with `aloop`, trim to `totalDurationSec`, pre-attenuate to ~-20dB.
  - Duck: `sidechaincompress` on music keyed by VO
    (`threshold=0.03:ratio=8:attack=200:release=800`) so music drops under speech.
  - Mix: `amix` of VO + ducked music (+ SFX if present), `normalize=0`.
  - Finalize: `loudnorm=I=-16:TP=-1.5:LRA=11`, 48kHz stereo → `outPath`.
  - If `musicPath` is null and `sfxPath` is null, copy VO through (no-op safety).

### Wiring (`src/pipeline/build-plan.ts`)

After `vo-norm.wav` is produced and `planWithTiming` is known:
1. Compute rounded cumulative scene bounds (same `r2`/bounds logic as the
   composition) from `planWithTiming.scenes[i].duration`.
2. Build the SFX event list: a `whoosh` at each non-last scene's content-end
   (`start + dur`), and a soft `pop` at each scene's headline entrance
   (`start + 0.3`).
3. `resolveOrSynthMusic(brand/audio, out/audio/music-bed.wav, totalDuration)`.
4. `buildSfxTrack(events, totalDuration, out/audio, out/audio/sfx.wav)`.
5. `mixFinalAudio({ vo: vo-norm.wav, music, sfx, totalDuration, out/audio, out/audio/final.wav })`.
6. Pass `audio/final.wav` to `buildCompositionV2` as `audioRelPath`.

Captions still transcribe from `vo-norm.wav` (clean speech, better Whisper
accuracy) — unchanged.

## Assets / config

- `brand/audio/` — new directory. Empty by default (a `.gitkeep`). Drop one
  royalty-free `.mp3`/`.wav`/`.m4a` here to override the synth bed. README note
  points to Pixabay Music / YouTube Audio Library / FMA CC0, search brief:
  "corporate ambient pad, ~80 BPM, minimal, no drums."
- No env vars required. Optional `ENABLEMENT_MUSIC_GAIN_DB` (default `-20`) and
  `ENABLEMENT_NO_MUSIC=1` / `ENABLEMENT_NO_SFX=1` escape hatches.

## Error handling

- ffmpeg failures throw with the command's stderr (matches existing pattern).
- Missing `brand/audio/` → treated as "no track" → synth bed.
- More than one candidate track in `brand/audio/` → error naming the files
  (ambiguous — user must leave exactly one).

## Testing

- `music.test.ts`: `synthMusicBed` writes a wav whose ffprobe duration is within
  ±0.1s of requested; `resolveMusicTrack` returns the file when one present,
  `null` when none, throws when >1.
- `sfx.test.ts`: `synthWhoosh`/`synthPop` produce non-empty wavs;
  `buildSfxTrack` output duration ≈ total; zero events → silent bed of total.
- `mix.test.ts`: `mixFinalAudio` output duration ≈ total and has an audio stream;
  null music + null sfx → duration ≈ VO (passthrough).
- e2e: existing pipeline test still renders; `out/**/audio/final.wav` exists and
  the mp4 has an audio stream ≈ total duration. QA gate unaffected (`ok: true`).

## Out of scope

- Per-scene music changes, stems, or beat-synced motion.
- Music generation beyond the static synth pad.
- SFX on every staggered element (only headline entrance + transitions — tasteful).

## Global constraints (carried from project)

- Deterministic render: no `Date.now`, `Math.random`, `new Date(`, `fetch(`,
  network, in anything that reaches the composition/timeline. (ffmpeg filter
  graphs are static and run at build time — allowed.)
- On-brand only: N/A for audio (no color), but no new off-brand assets.
- bun runtime; ffmpeg/ffprobe already required. No new npm deps.
