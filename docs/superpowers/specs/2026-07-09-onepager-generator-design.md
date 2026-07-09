# One-Pager Generator — Design Spec

**Date:** 2026-07-09
**Sub-project:** One-pager generator (Milestone 6)
**Status:** Approved design → ready for implementation plan

## Goal

From the SAME VideoPlan the video is built from, generate a branded, single-page
enablement one-pager (HTML + auto-PDF) with the sales layer — value prop, who it's
for, when to use, how to position it (talking points), a hero still pulled from the
rendered video, and a link. "One plan, two outputs" — so the one-pager makes no claim
the video doesn't.

## Why

"Sales understands" was the original goal; the one-pager is the skimmable artifact a
rep keeps. Reusing the VideoPlan guarantees consistency and zero new claims.

## Architecture

Standalone module tree under `src/onepager/`, plus an optional hook in the render
pipeline so `buildFromPlan` emits the one-pager alongside the video (non-fatal).

Data flow:
```
VideoPlan (v3 JSON) + BrandTokens ─┐
                                   ├─> renderOnePagerHtml() ──> onepager.html
rendered video.mp4 (optional) ─────┘        │  (hero still embedded as data URI)
                                            └─> htmlToPdf() [headless Chrome] ──> onepager.pdf (best-effort)
```

### Units

**`src/onepager/render-html.ts`** — pure HTML builder (no I/O).
- `renderOnePagerHtml(plan: VideoPlanV3, t: BrandTokens, opts?: { heroDataUri?: string; videoUrl?: string; docsUrl?: string; logoRelPath?: string }): string`
- Single A4 page (`@page { size: A4; margin: 0 }`), print-optimized, **light background**
  (white page, professional/printable) with a **deep-blue header band** (logo + "Enablement")
  and orange/teal accents from tokens. Sections, in order:
  1. Header band: UiPath logo + "Enablement · Internal Draft" + `feature_name`.
  2. Value prop: `value_prop` as the hero line.
  3. Hero still (if `heroDataUri`): the frame from the video, rounded, with a
     "▶ Watch the 2-min enablement video" caption linking `videoUrl` (or a placeholder).
  4. Two columns: **Who it's for** (`persona`) + **When to use** (`when_to_use`).
  5. **How to position it** — `talking_points[]` as a checked list (the sales layer).
  6. Footer: `docsUrl` (or placeholder) + "Generated from the merge — review before
     sharing externally" (reinforces human-in-the-loop) + UiPath mark.
- All colors/fonts via token values; escape all interpolated plan text (reuse
  `escapeHtml` from `src/compose/scene-card.ts`).

**`src/onepager/hero-still.ts`** — video frame → embeddable image.
- `extractHeroStill(videoPath: string, atSec: number, outPngPath: string): void` — ffmpeg
  `-ss atSec -i video -frames:v 1 -vf scale=1280:-1 out.png` (deterministic).
- `pngToDataUri(pngPath: string): string` — read file → `data:image/png;base64,...`.

**`src/onepager/to-pdf.ts`** — HTML → PDF via headless Chrome (best-effort, optional).
- `resolveChrome(): string | null` — check `CHROME_PATH` env, then the macOS default
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, then `which`
  `google-chrome`/`chromium`/`chromium-browser`. Return the first that exists, else null.
- `htmlToPdf(htmlPath: string, pdfPath: string): boolean` — if `resolveChrome()` is null,
  return `false` (caller keeps the HTML). Else run
  `chrome --headless=new --disable-gpu --no-sandbox --print-to-pdf=<pdf> --no-pdf-header-footer file://<html>`
  and return `true`.

**`src/onepager/build-onepager.ts`** — orchestrator + CLI.
- `buildOnePager(plan, t, outDir, opts?: { videoPath?: string; heroStillAtSec?: number; videoUrl?: string; docsUrl?: string; logoSrcPath?: string }): { htmlPath: string; pdfPath: string | null }`
  - Copy logo into `outDir/assets` (like the video path), embed hero still as data URI
    if a `videoPath` exists (default `heroStillAtSec` = `min(8, probe(dur)*0.4)`), write
    `onepager.html`, then `htmlToPdf` → `onepager.pdf` (pdfPath null if Chrome absent).
- `import.meta.main`: `bun run src/onepager/build-onepager.ts <plan.json> [videoPath]`
  → writes into `out/onepager/`.

### Pipeline hook (`src/pipeline/build-plan.ts`)

After the render + QA, add a non-fatal block: build the one-pager from the same
`plan` + `tokens`, using the just-rendered `renders/video.mp4` for the hero still,
into `<outDir>/onepager/`. Wrap in try/catch → a one-pager failure must never fail
the video build (log a warning). PDF is best-effort (skipped if no Chrome).

## Error handling

- Missing/`heroDataUri` absent → render the page without the still block (graceful).
- No Chrome → `htmlToPdf` returns false; HTML still written; caller logs "PDF skipped".
- ffmpeg frame extract failure → caught by orchestrator; one-pager still emits (no still).

## Testing

- `render-html.test.ts`: output contains `feature_name`, `value_prop`, each
  `talking_point`, `persona`, `when_to_use`; contains token color values; escapes a
  `<script>`-y feature name; omits the still block when no `heroDataUri`, includes an
  `<img src="data:image/png` when provided.
- `hero-still.test.ts`: generate a 2s test video (ffmpeg lavfi), `extractHeroStill` at
  1s writes a PNG > 1KB; `pngToDataUri` returns a `data:image/png;base64,` string.
- `to-pdf.test.ts`: `resolveChrome` returns a string-or-null (no throw); `htmlToPdf`
  with a tiny HTML → if Chrome present, a PDF > 1KB and returns true; else returns false
  and does not throw. (Guard the assertion on `resolveChrome()`.)
- `build-onepager.test.ts`: given the demo plan + the existing rendered video, produces
  `onepager.html` containing the hero data URI; `pdfPath` is a path (Chrome) or null.
- Existing suite stays green; the pipeline hook is try/caught so a one-pager issue can't
  break the video e2e.

## Out of scope

- QR codes (chose still+link); multi-page docs; editable formats (Docx/Google Docs).
- A strict brand-palette QA gate for the one-pager (it uses print greys/white the video
  gate would reject); structural content checks only.
- Publishing/hosting the PDF.

## Global constraints (carried)

- No new npm dependencies — ffmpeg + a system Chrome only (Chrome optional; HTML always
  produced). bun runtime.
- Reuse `escapeHtml`; never inject unescaped plan text. Ground all copy in the VideoPlan
  (no invented claims).
- Brand tokens are the single source of color/font truth.
