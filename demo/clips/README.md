# demo/clips — real product footage for the demo beat

Drop **one** screen recording of a real UiPath feature working here, then tell me the
file path + which feature it is. I'll wire it into `real-demo.v3.json` as a footage
scene (with auto-zoom), align the video's wording to match, and render.

## What to record
A real, browser-based UiPath feature doing **one thing, end to end**:
1. **Start** — the entry screen (context).
2. **Action** — the key thing the feature does (the "wow" moment the zoom spotlights).
3. **Result** — the outcome on screen.

## Specs
- **1080p or higher, 16:9** (macOS: Cmd+Shift+5). Non-16:9 is fine — it gets letterboxed.
- **15–40 seconds** of actual product use.
- **Just the screen — no audio/narration needed.** Our voiceover is laid over it.
- **Clean:** logged in, realistic data, **no PII/secrets**, no error states, no clutter.
- Ideally the exact happy path an E2E test would run (ties to the "reused from the test/PR" beat).

## What you do NOT need
- No problem-telling, no reasons, no talking in the clip — the surrounding video supplies
  the whole story, the narration over your clip, the zoom, music, and captions.

## Format
`.mp4` or `.mov`. Any filename is fine (e.g. `feature-demo.mp4`).
