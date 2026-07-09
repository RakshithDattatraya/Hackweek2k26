# Footage-Path Captions + QA Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the two documented v1 gaps on the footage path (`buildFromBranch`): (1) burn captions onto the concatenated video, and (2) run the QA gate over the generated segments — reaching parity with the generated (`buildFromPlan`) path.

**Design (closing M7 out-of-scope items):**
- **Captions:** the footage path concats already-rendered mp4s, so there is no composition to overlay captions into (unlike `buildFromPlan`, which overlays in HTML). Instead: transcribe the concatenated VO (`audio/vo-norm.wav`) via `npx hyperframes transcribe` (same tool the generated path uses), convert word timings to an **SRT** file, and **burn** it onto the video with ffmpeg's `subtitles` filter during the final mux (a re-encode, replacing `-c:v copy` when captions are present). Best-effort: if transcription is unavailable, fall back to no captions (today's behavior).
- **QA gate:** `lintPlan(plan)` (determinism) + `brandCheck(plan, tokens)` (palette) run on the FULL plan — the footage scene has no scripts/html so it's naturally skipped. `renderCheck(dir)` runs on each generated segment dir (`seg-front`, `seg-back`) that exists. Aggregate to `qa-report.json` (same shape as the generated path).

**Tech Stack:** TypeScript, bun, ffmpeg, existing `src/qa/*` modules. No new deps.

## Global Constraints

- No new npm dependencies.
- Captions are best-effort: a transcription failure must NOT fail the build (fall back to no captions).
- Do not change the no-footage path (`buildFromPlan`) or any other existing module; only add `captions-srt.ts` and edit `build-from-branch.ts`.
- Caption cue grouping must match the generated path's heuristic (~42 chars / 8 words / sentence-end) for visual consistency.

---

### Task 1: SRT caption builder (`src/compose/captions-srt.ts`)

**Files:** Create `src/compose/captions-srt.ts`; Test `src/compose/captions-srt.test.ts`

**Interfaces:**
- `type SrtWord = { text: string; start: number; end: number }`
- `wordsToSrt(words: SrtWord[]): string`

- [ ] **Step 1: Write the failing test** — `src/compose/captions-srt.test.ts`:

```ts
import { test, expect } from "bun:test";
import { wordsToSrt } from "./captions-srt";

test("wordsToSrt emits numbered cues with SRT timestamps", () => {
  const words = [
    { text: "Hello", start: 0.0, end: 0.4 },
    { text: "there.", start: 0.5, end: 0.9 },
    { text: "Next", start: 1.0, end: 1.3 },
    { text: "line", start: 1.4, end: 1.7 },
  ];
  const srt = wordsToSrt(words);
  expect(srt).toContain("1\n00:00:00,000 --> 00:00:00,900\nHello there.");
  // sentence-end after "there." starts a new cue
  expect(srt).toContain("2\n00:00:01,000 --> 00:00:01,700\nNext line");
});

test("wordsToSrt groups long runs into multiple cues and formats mm:ss", () => {
  const words = Array.from({ length: 10 }, (_, i) => ({ text: `w${i}`, start: 60 + i, end: 60.5 + i }));
  const srt = wordsToSrt(words);
  expect(srt).toContain("00:01:00,000"); // minute formatting
  // 10 words with an 8-word cap → at least 2 cues
  expect(srt.trim().split(/\n\n/).length).toBeGreaterThanOrEqual(2);
});

test("empty input → empty string", () => {
  expect(wordsToSrt([])).toBe("");
});
```

- [ ] **Step 2: Run to verify fail** — `bun test src/compose/captions-srt.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/compose/captions-srt.ts`:

```ts
export type SrtWord = { text: string; start: number; end: number };

function fmt(t: number): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rem = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(rem, 3)}`;
}

/** Group words into caption cues (~42 chars / 8 words / sentence-end) and format as SRT. */
export function wordsToSrt(words: SrtWord[]): string {
  const cues: { start: number; end: number; text: string }[] = [];
  let cur: SrtWord[] = [], len = 0;
  const flush = () => {
    if (cur.length) { cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(" ") }); cur = []; }
  };
  for (const w of words) {
    cur.push(w); len += w.text.length + 1;
    if (len >= 42 || cur.length >= 8 || /[.?!]$/.test(w.text.trim())) { flush(); len = 0; }
  }
  flush();
  return cues.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join("\n");
}
```

- [ ] **Step 4: Run to verify pass** — `bun test src/compose/captions-srt.test.ts` → PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add src/compose/captions-srt.ts src/compose/captions-srt.test.ts
git commit -m "feat: SRT caption builder for the footage path (word timings -> SRT cues)"
```

---

### Task 2: Wire QA gate + caption burn-in into `build-from-branch.ts`

**Files:** Modify `src/pipeline/build-from-branch.ts`; Test `src/pipeline/build-from-branch-qa.test.ts`

**Context:** In `buildFromBranch`, after `concatVideos`/`concatAudios` produce `bodyVideo` (`renders/body.mp4`) + `fullVo` (`audio/vo-norm.wav`), and after `mixFinalAudio` writes `audio/final.wav`, there is a final ffmpeg mux (`-c:v copy`) into `renders/video.mp4`, then the one-pager block, then `return finalVideo`. The `plan`, `tokens`, `outDir`, `front`, `back`, `bodyVideo`, `finalAudio`, `finalVideo` locals are all in scope there.

**Interfaces:** none new exported; `buildFromBranch` signature unchanged.

- [ ] **Step 1: Write the failing test** — `src/pipeline/build-from-branch-qa.test.ts`:

```ts
import { test, expect } from "bun:test";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildFromBranch } from "./build-from-branch";

test("footage path writes qa-report.json and still renders video+audio", async () => {
  const dir = join(process.cwd(), "out/test-branch-qa"); rmSync(dir, { recursive: true, force: true });
  execFileSync("mkdir", ["-p", dir]);
  const clip = join(dir, "demo.mp4");
  execFileSync("ffmpeg", ["-y","-f","lavfi","-i","testsrc=size=640x360:rate=15","-t","2","-pix_fmt","yuv420p", clip], { stdio: "ignore" });
  const plan = {
    feature_name: "F", value_prop: "v", persona: "p", when_to_use: "w", talking_points: ["t"],
    scenes: [
      { id: "hook", html: "<div style='color:var(--uip-white)'>Hook</div>", narration: "The hook." },
      { id: "demo", footage: { narration: "Here it is in action.", clipPath: clip } },
      { id: "cta", html: "<div style='color:var(--uip-white)'>CTA</div>", narration: "Learn more." },
    ],
    youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
  };
  const planPath = join(dir, "plan.json");
  execFileSync("bash", ["-lc", `cat > '${planPath}'`], { input: JSON.stringify(plan) });
  const outDir = join(dir, "out");
  const out = await buildFromBranch(planPath, outDir);
  // QA report exists and is well-formed
  const qa = JSON.parse(readFileSync(join(outDir, "qa-report.json"), "utf8"));
  expect(typeof qa.ok).toBe("boolean");
  expect(Array.isArray(qa.findings)).toBe(true);
  // video still renders with audio
  const hasAudio = execFileSync("ffprobe", ["-v","error","-select_streams","a","-show_entries","stream=codec_type","-of","default=noprint_wrappers=1:nokey=1", out]).toString().trim();
  expect(hasAudio).toBe("audio");
  rmSync(dir, { recursive: true, force: true });
}, 300000);
```

- [ ] **Step 2: Run to verify fail** — `bun test src/pipeline/build-from-branch-qa.test.ts` → FAIL (no qa-report.json written yet). Run with the render env exports (NVM, HYPERFRAMES_NODE_BIN, ELEVENLABS_VOICE_ID=ErXwobaYiN019PkySvjV).

- [ ] **Step 3: Implement the edits in `src/pipeline/build-from-branch.ts`.**

(a) Add imports near the top (with the other imports):
```ts
import { writeFileSync } from "node:fs";
import { runGate } from "../qa/gate";
import { renderCheck } from "../qa/render-check";
import { wordsToSrt } from "../compose/captions-srt";
```
(Note: `mkdirSync, readFileSync, existsSync` are already imported from `node:fs` — ADD `writeFileSync` to that existing import; do not duplicate the import line.)

(b) REPLACE the final mux block. Find the existing lines:
```ts
  const finalVideo = join(outDir, "renders/video.mp4");
  execFileSync("ffmpeg", ["-y", "-i", bodyVideo, "-i", finalAudio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", finalVideo], { stdio: "ignore" });
```
and replace with:
```ts
  // Captions: transcribe the concatenated VO → SRT → burn onto the video (best-effort).
  let subFilter = "";
  try {
    const nodeBin = process.env.HYPERFRAMES_NODE_BIN;
    const hfEnv = nodeBin ? { ...process.env, PATH: `${nodeBin}:${process.env.PATH}` } : process.env;
    execFileSync("npx", ["-y", "hyperframes@latest", "transcribe", "audio/vo-norm.wav", "--json", "--optional"], { cwd: outDir, env: hfEnv, stdio: "ignore" });
    const words = JSON.parse(readFileSync(join(audioOut, "transcript.json"), "utf8"));
    writeFileSync(join(outDir, "captions.srt"), wordsToSrt(words));
    subFilter = "subtitles=captions.srt:force_style='FontName=Inter,FontSize=16,PrimaryColour=&Hffffff&,OutlineColour=&H80000000&,BorderStyle=1,Outline=1,Shadow=1,Alignment=2,MarginV=50'";
  } catch { subFilter = ""; }

  const finalVideo = join(outDir, "renders/video.mp4");
  if (subFilter) {
    // Burn captions (re-encode). Run from outDir so the subtitles filter uses a relative path.
    execFileSync("ffmpeg", ["-y", "-i", "renders/body.mp4", "-i", "audio/final.wav", "-map", "0:v:0", "-map", "1:a:0", "-vf", subFilter, "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "renders/video.mp4"], { cwd: outDir, stdio: "ignore" });
  } else {
    execFileSync("ffmpeg", ["-y", "-i", bodyVideo, "-i", finalAudio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", finalVideo], { stdio: "ignore" });
  }

  // QA gate over the generated segments (lint + brand on the full plan; render-check per segment).
  const gateBase = runGate(plan as any, tokens, "", { skipRenderCheck: true });
  const segFindings = [
    ...(front ? renderCheck(join(outDir, "seg-front")) : []),
    ...(back ? renderCheck(join(outDir, "seg-back")) : []),
  ];
  const qa = { ok: gateBase.findings.length + segFindings.length === 0, findings: [...gateBase.findings, ...segFindings] };
  writeFileSync(join(outDir, "qa-report.json"), JSON.stringify(qa, null, 2));
  if (!qa.ok) console.warn(`QA gate found ${qa.findings.length} issue(s) — see qa-report.json.`);
```
Leave the subsequent one-pager block and `return finalVideo;` unchanged.

- [ ] **Step 4: Run to verify pass** — with render env exported:
```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use stable
export HYPERFRAMES_NODE_BIN="/Users/rakshithdattatrayahegde/.nvm/versions/node/v24.14.1/bin"
export ELEVENLABS_VOICE_ID="ErXwobaYiN019PkySvjV"; export ELEVENLABS_STYLE="0.6"; export ELEVENLABS_STABILITY="0.35"
bun test src/pipeline/build-from-branch-qa.test.ts
```
Expected: PASS — `qa-report.json` written (ok:boolean, findings:array), video has audio. (Captions burn only if transcribe succeeds; the test does not require captions, only the qa report + a valid video, so it passes either way.)

- [ ] **Step 5: Confirm the plain footage e2e still passes (no regression):**
```bash
bun test src/pipeline/build-from-branch.test.ts
```
Expected: PASS (still produces a video+audio; now also a qa-report.json).

- [ ] **Step 6: Commit**
```bash
git add src/pipeline/build-from-branch.ts src/pipeline/build-from-branch-qa.test.ts
git commit -m "feat: footage path gains burned captions + QA gate (parity with generated path)"
```

---

## Self-Review

- **Coverage:** captions SRT builder (T1); transcribe→burn + QA aggregation wired into the footage orchestrator (T2). Both documented M7 gaps closed.
- **Placeholders:** none.
- **Type consistency:** `wordsToSrt(SrtWord[])` matches the transcript word shape `{text,start,end}`; `runGate(plan, tokens, "", {skipRenderCheck})` + `renderCheck(dir)` match existing signatures.
- **Non-regression:** `buildFromPlan` and all other modules untouched; captions are best-effort (try/catch → no-caption fallback); QA is additive (writes a report, warns, does not throw).
- **Safety:** subtitles filter uses a relative path via `cwd: outDir` to avoid `:`-escaping issues; caption text comes from the VO transcript (already grounded).
