import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { validateScenePlan } from "../scenes/registry";
import { isCustomScene, isFootageScene } from "../content-director/plan-schema";
import { synthesizePlanAudio } from "../audio/assemble-audio";
import { buildCompositionV2 } from "../compose/build-composition-v2";
import { render } from "../render/render";
import { loadBrandTokens } from "../brand/token-resolver";
import { pickSynthesizer } from "./build-plan";

/** Render a subset of scenes to an mp4 with VO-only audio (no music/SFX/captions). */
export function renderSegment(scenes: any[], outDir: string): { videoPath: string; voPath: string; duration: number; timedScenes: any[] } {
  const tokens = loadBrandTokens();
  // Validate only registry-component scenes (custom + footage handled elsewhere / excluded).
  validateScenePlan({ scenes: scenes.filter((s: any) => !isCustomScene(s) && !isFootageScene(s)) } as any);

  mkdirSync(join(outDir, "audio"), { recursive: true });
  mkdirSync(join(outDir, "renders"), { recursive: true });
  mkdirSync(join(outDir, "assets"), { recursive: true });
  execFileSync("cp", [join(process.cwd(), "brand/logos/uipath-logo-orange.png"), join(outDir, "assets/uipath-logo-orange.png")]);

  const plan = {
    feature_name: "segment", value_prop: "", persona: "", when_to_use: "",
    talking_points: ["x"], scenes,
    youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
  };
  const { planWithTiming } = synthesizePlanAudio(plan as any, pickSynthesizer(), join(outDir, "audio"), 0.9);
  execFileSync("ffmpeg", ["-y", "-i", join(outDir, "audio/vo.wav"), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", join(outDir, "audio/vo-norm.wav")], { stdio: "ignore" });

  buildCompositionV2(planWithTiming as any, tokens, outDir, { audioRelPath: "audio/vo-norm.wav", captionHtml: "" });
  render(outDir, "renders/video.mp4");

  const timedScenes = planWithTiming.scenes as any[];
  const duration = timedScenes.reduce((a, s) => a + (s.duration ?? 4), 0);
  return { videoPath: join(outDir, "renders/video.mp4"), voPath: join(outDir, "audio/vo-norm.wav"), duration, timedScenes };
}
