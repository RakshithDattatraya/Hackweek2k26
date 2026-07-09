import { mkdirSync, readFileSync, existsSync } from "node:fs";
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

function probeDur(p: string): number {
  return parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", p]).toString().trim());
}

export async function buildFromBranch(planPath: string, outDir: string): Promise<string> {
  const plan = validatePlanV3(JSON.parse(readFileSync(planPath, "utf8")));
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
  if (front) sfxEventsFromPlan({ scenes: before as any }).events.filter((e) => e.kind === "pop").forEach((e) => events.push(e));
  events.push({ at: frontDur, kind: "whoosh" });
  events.push({ at: frontDur + clipDur, kind: "whoosh" });
  if (back) sfxEventsFromPlan({ scenes: after as any }).events.filter((e) => e.kind === "pop").forEach((e) => events.push({ at: e.at + frontDur + clipDur, kind: "pop" }));

  const noMusic = process.env.ENABLEMENT_NO_MUSIC === "1", noSfx = process.env.ENABLEMENT_NO_SFX === "1";
  const libTrack = selectLibraryTrack((plan as any).music_mood, join(process.cwd(), "brand/audio/library"));
  const musicPath = noMusic ? null : (libTrack ?? resolveOrSynthMusic(join(process.cwd(), "brand/audio"), join(audioOut, "music-bed.wav"), total));
  let sfxPath: string | null = null;
  if (!noSfx) { sfxPath = join(audioOut, "sfx.wav"); buildSfxTrack(events, total, audioOut, sfxPath); }
  const finalAudio = join(audioOut, "final.wav");
  mixFinalAudio({ voPath: fullVo, musicPath, sfxPath, totalDurationSec: total, workDir: audioOut, outPath: finalAudio, musicGainDb: process.env.ENABLEMENT_MUSIC_GAIN_DB ? Number(process.env.ENABLEMENT_MUSIC_GAIN_DB) : undefined });

  const finalVideo = join(outDir, "renders/video.mp4");
  execFileSync("ffmpeg", ["-y", "-i", bodyVideo, "-i", finalAudio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", finalVideo], { stdio: "ignore" });

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
