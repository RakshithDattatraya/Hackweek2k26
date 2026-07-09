# PR-Aware Footage Ingest + Segment-Concat — Design Spec

**Date:** 2026-07-09
**Sub-project:** PR ingest + reuse-or-generate video (Milestone 7)
**Status:** Draft design → pending user review

## Goal

Make the pipeline PR-aware. From the current git branch, derive the feature context
(the "PR") and detect whether a demo video ships with it:
- **No demo video** → generate the enablement video as today (motion-graphics demo beat).
- **Demo video present** → reuse that clip as the demo beat, wrapped in a full generated
  enablement video (branded intro + hook → the real clip → positioning → CTA) with music,
  SFX, and captions over the whole. Combine via **ffmpeg segment-concat** (robust; no
  dependency on HyperFrames in-timeline video).

Auto-zoom / camera director is explicitly deferred to a later milestone.

## Why

The merge moment is when context is richest, and engineers often already attach a screen
recording to the PR. Reusing that clip (instead of fragile auto-capture) sidesteps the
"stable staging env" blocker and still produces a premium, on-brand enablement piece.

## Architecture

Two paths through one orchestrator. The **no-footage path is exactly today's pipeline**
(unchanged). The **footage path** renders the generated beats as two segments and
ffmpeg-concats the normalized clip between them, then applies the existing audio mix.

```
git branch ──> PR context (log main..HEAD + diff + branch)  ──┐
               detect demo video in changed files ────────────┤
                                                              ▼
                        demo video present?
             ┌────────── no ──────────┐        ┌───────── yes ─────────────────────┐
             ▼                         │        ▼                                    │
   existing buildFromPlan             │   split plan.scenes at the demo marker:      │
   (single composition, unchanged)    │   [before] + <FOOTAGE> + [after]             │
                                       │   renderSegment(before)  -> front.mp4 (VO)   │
                                       │   normalizeClip(demo.mp4) -> clip.mp4 (+VO)  │
                                       │   renderSegment(after)   -> back.mp4  (VO)   │
                                       │   concat[front, clip, back] -> body.mp4+vo   │
                                       │   music/SFX mix over whole; captions         │
                                       └──────────────────────────────────────────────┘
                                                              ▼
                                              final video.mp4 (+ one-pager)
```

### Components (6)

1. **PR/branch ingest — `src/ingest/pr-context.ts`**
   - `getPrContext(repoRoot?, baseBranch = "main"): { branch, headSha, commits: string[], diffFiles: string[], diff: string, title: string, body: string }`
     — pure git: `git rev-parse`, `git log <base>..HEAD`, `git diff --name-only <base>...HEAD`,
     `git diff <base>...HEAD`. `title` = first line of the newest commit; `body` = concatenated
     commit bodies. (Optional GitHub-API enrich is out of scope for v1; git is the source.)
   - `detectDemoVideo(diffFiles, repoRoot): string | null` — first changed file matching
     `\.(mp4|mov|webm)$` that exists in the working tree, resolved absolute. Null if none.

2. **Footage scene in the plan schema — `src/content-director/plan-schema.ts`**
   - Add an optional footage scene shape to V3: a scene `{ id, footage: { narration: string; clipPath?: string }, transition?… }`.
     `clipPath` is filled by the orchestrator from `detectDemoVideo` (or the plan may hardcode
     one). A scene is "the demo beat" iff it has a `footage` key. `isFootageScene(s)` guard.
   - No footage scene, or footage scene but no resolvable clip → that beat renders as its
     authored motion-graphics (back-compat) / is skipped.

3. **Clip normalization — `src/footage/normalize.ts`**
   - `normalizeClip(inPath, outPath, opts?: { width?: 1920; height?: 1080; fps?: 30 }): { duration: number }`
     — ffmpeg: scale to fit + pad to 1920×1080, `fps=30`, `setsar=1`, `yuv420p`, and guarantee
     an audio stream (add `anullsrc` if the clip has none) so concat is uniform. Returns the
     normalized duration (ffprobe).

4. **Reusable segment renderer — refactor `src/pipeline/build-plan.ts`**
   - Extract the current "scenes → per-scene VO → vo-norm → composition → render" core into
     `renderSegment(scenes, tokens, outDir, opts): { videoPath, voNormPath, duration }` that
     renders a subset of scenes to an mp4 whose audio is **VO-only** (no music/SFX — those are
     applied once over the final concat). `buildFromPlan` (no-footage path) keeps its current
     behavior by calling the same core over all scenes then the existing music/SFX mix — i.e.
     the refactor must be behavior-preserving for the existing path (verified by the existing
     e2e test still producing an identical-structure render + qa ok).

5. **Concat + final audio — `src/compose/concat-segments.ts`**
   - `concatSegments(parts: string[], outPath): void` — ffmpeg concat demuxer over uniform
     mp4s (front, clip, back) → body.mp4 (video + concatenated VO/clip audio).
   - Final audio: reuse `mixFinalAudio` (music bed + SFX) over the concatenated audio and total
     duration; SFX event times recomputed for the concatenated timeline (a whoosh at each
     segment seam, pops within generated segments); captions transcribed from the concatenated
     VO. Re-mux onto body.mp4.

6. **Footage-aware orchestrator + CLI — `src/pipeline/build-from-branch.ts`**
   - `buildFromBranch(planPath?, outDir): string` — get PR context, detect demo video; if the
     plan has a footage beat and a clip resolves, run the footage path; else delegate to the
     existing `buildFromPlan`. Always emit the one-pager. CLI:
     `bun run src/pipeline/build-from-branch.ts [plan.json]`.
   - The demo-beat narration comes from the plan's footage scene (director-authored, grounded
     in the diff — no invented claims).

### Determinism / safety

- ffmpeg graphs static; VO synth is the existing (network build-time) TTS. Concat/normalize
  deterministic. No new network beyond existing TTS.
- The existing no-footage path is unchanged; footage is additive.
- Demo-beat narration is authored (plan), grounded in the PR diff.

## Testing

- `pr-context.test.ts`: in a temp git repo, `getPrContext` returns branch/commits/diffFiles;
  `detectDemoVideo` finds a committed `.mp4` and returns null when none.
- `normalize.test.ts`: normalize a tiny non-1080p clip → output is 1920×1080/30 with an audio
  stream; returns a plausible duration.
- `concat-segments.test.ts`: concat three tiny uniform clips → duration ≈ sum, has audio+video.
- `plan-schema` + `renderSegment`: footage-scene guard parses; `renderSegment` over a 2-scene
  subset renders an mp4 with audio (VO-only).
- e2e: (a) existing no-footage dogfood still renders `ok:true` (refactor is behavior-preserving);
  (b) a footage fixture (2 generated beats + a tiny test clip) produces a concatenated mp4 whose
  duration ≈ front+clip+back and QA ok.

## Out of scope (later milestones)

- Auto-zoom / camera director / callouts over footage.
- GitHub API / gh enrichment (title/body/labels) — git is the v1 source.
- Downloading a demo video from a URL in the PR body (v1 = committed file in the diff).
- Per-segment crossfades across the footage seam (v1 = hard cut or a simple concat; seam
  whoosh SFX masks it).

## Global constraints (carried)

- No new npm deps; ffmpeg/ffprobe + existing modules. bun runtime.
- Ground demo narration in the PR/diff; no invented claims.
- Brand tokens the single source of color/font truth; existing QA gate still applies to
  generated segments.

## Open dependency for the demo

To exercise the footage path we need a short sample screen-recording committed to a branch
(any `.mp4` in the diff). I'll include a tiny generated test clip for tests; for the real
demo you'd drop an actual recording.
