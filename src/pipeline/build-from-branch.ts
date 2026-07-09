import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { validatePlanV3, isFootageScene } from "../content-director/plan-schema";
import { loadBrandTokens } from "../brand/token-resolver";
import { getPrContext, detectDemoVideo } from "../ingest/pr-context";
import { buildFromPlan, pickSynthesizer, sfxEventsFromPlan } from "./build-plan";
import { renderSegment } from "./render-segment";
import { normalizeClip } from "../footage/normalize";
import { concatVideos, concatAudios } from "../compose/concat-segments";
import { mixFinalAudio } from "../audio/mix";
import { buildSfxTrack, type SfxEvent } from "../audio/sfx";
import { selectLibraryTrack } from "../audio/library";
import { resolveOrSynthMusic } from "../audio/music";
import { buildOnePager } from "../onepager/build-onepager";
import { runGate } from "../qa/gate";
import { renderCheck } from "../qa/render-check";
import { wordsToSrt } from "../compose/captions-srt";

function probeDur(p: string): number {
  return parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", p]).toString().trim());
}

export async function buildFromBranch(planPath: string, outDir: string): Promise<string> {
  const plan = validatePlanV3(JSON.parse(readFileSync(planPath, "utf8")));
  if (plan.scenes.filter((s: any) => isFootageScene(s)).length > 1) {
    throw new Error("Only one footage scene is supported per plan (found multiple).");
  }
  const footageIdx = plan.scenes.findIndex((s: any) => isFootageScene(s));

  let clipPath: string | null = null;
  if (footageIdx >= 0) {
    const fscene = plan.scenes[footageIdx] as any;
    if (fscene.footage.clipPath && existsSync(fscene.footage.clipPath)) clipPath = fscene.footage.clipPath;
    else clipPath = detectDemoVideo(getPrContext().diffFiles);
  }

  // No footage beat or no clip resolved → standard generated pipeline (unchanged).
  if (footageIdx < 0 || !clipPath) {
    if (footageIdx >= 0) console.log("No demo video found in the branch — generating the full video.");
    return buildFromPlan(planPath, outDir);
  }

  console.log(`Demo video: ${clipPath} — wrapping it in a full enablement video.`);
  const tokens = loadBrandTokens();
  const audioOut = join(outDir, "audio");
  mkdirSync(audioOut, { recursive: true });
  mkdirSync(join(outDir, "renders"), { recursive: true });

  const footageScene = plan.scenes[footageIdx] as any;
  const before = plan.scenes.slice(0, footageIdx);
  const after = plan.scenes.slice(footageIdx + 1);

  const front = before.length ? renderSegment(before as any, join(outDir, "seg-front")) : null;
  const back = after.length ? renderSegment(after as any, join(outDir, "seg-back")) : null;

  const clip = join(outDir, "clip.mp4");
  const { duration: clipDur } = normalizeClip(clipPath, clip);

  // demo-beat VO, padded/trimmed to the clip length
  const rawVo = join(audioOut, "demo-vo-raw.wav");
  pickSynthesizer().synthesize(footageScene.footage.narration, rawVo);
  const clipVo = join(audioOut, "demo-vo.wav");
  execFileSync("ffmpeg", ["-y", "-i", rawVo, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,apad", "-t", clipDur.toFixed(3), "-ar", "48000", "-ac", "2", clipVo], { stdio: "ignore" });

  const videos = [front?.videoPath, clip, back?.videoPath].filter(Boolean) as string[];
  const vos = [front?.voPath, clipVo, back?.voPath].filter(Boolean) as string[];
  const bodyVideo = join(outDir, "renders/body.mp4");
  concatVideos(videos, bodyVideo);
  const fullVo = join(audioOut, "vo-norm.wav");
  concatAudios(vos, fullVo);
  const total = probeDur(bodyVideo);

  // SFX: pops within generated segments (offset), whooshes at the two seams.
  const frontDur = front ? probeDur(front.videoPath) : 0;
  const events: SfxEvent[] = [];
  // Use the segments' REAL VO-driven scene timings (front.timedScenes), not the raw plan
  // scenes (which lack durations → would default to 4s and misplace pops into the clip).
  if (front) sfxEventsFromPlan({ scenes: front.timedScenes }).events.filter((e) => e.kind === "pop").forEach((e) => events.push(e));
  events.push({ at: frontDur, kind: "whoosh" });
  events.push({ at: frontDur + clipDur, kind: "whoosh" });
  if (back) sfxEventsFromPlan({ scenes: back.timedScenes }).events.filter((e) => e.kind === "pop").forEach((e) => events.push({ at: e.at + frontDur + clipDur, kind: "pop" }));

  const noMusic = process.env.ENABLEMENT_NO_MUSIC === "1", noSfx = process.env.ENABLEMENT_NO_SFX === "1";
  const libTrack = selectLibraryTrack((plan as any).music_mood, join(process.cwd(), "brand/audio/library"));
  const musicPath = noMusic ? null : (libTrack ?? resolveOrSynthMusic(join(process.cwd(), "brand/audio"), join(audioOut, "music-bed.wav"), total));
  let sfxPath: string | null = null;
  if (!noSfx) { sfxPath = join(audioOut, "sfx.wav"); buildSfxTrack(events, total, audioOut, sfxPath); }
  const finalAudio = join(audioOut, "final.wav");
  mixFinalAudio({ voPath: fullVo, musicPath, sfxPath, totalDurationSec: total, workDir: audioOut, outPath: finalAudio, musicGainDb: process.env.ENABLEMENT_MUSIC_GAIN_DB ? Number(process.env.ENABLEMENT_MUSIC_GAIN_DB) : undefined });

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
  let burned = false;
  if (subFilter) {
    try {
      execFileSync("ffmpeg", ["-y", "-i", "renders/body.mp4", "-i", "audio/final.wav", "-map", "0:v:0", "-map", "1:a:0", "-vf", subFilter, "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "renders/video.mp4"], { cwd: outDir, stdio: "ignore" });
      burned = true;
    } catch { burned = false; } // e.g. ffmpeg build lacks libass/subtitles filter — fall back below.
  }
  if (!burned) {
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

  try {
    const op = buildOnePager(plan as any, tokens, join(outDir, "onepager"), { videoPath: finalVideo });
    console.log(`One-pager: ${op.htmlPath}${op.pdfPath ? ` (+ ${op.pdfPath})` : ""}`);
  } catch (e: any) { console.warn("One-pager skipped:", e?.message); }

  console.log(`Rendered (footage-wrapped): ${finalVideo} (${total.toFixed(1)}s)`);
  return finalVideo;
}

if (import.meta.main) {
  const planPath = process.argv[2] || "demo/feature-video.v3.json";
  buildFromBranch(planPath, join(process.cwd(), "out/latest-v2")).then((p) => console.log("Done:", p));
}
