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

## Optional explicit manifest (library.json)
Instead of the filename convention, provide a library.json array of
{ "file": "...", "mood": "...", "bpm": 0, "note": "..." } objects (bpm/note optional).
