import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { promptToSourceContext } from "../ingest/manual-prompt";
import { generatePlan } from "../content-director/content-director";
import { loadBrandTokens } from "../brand/token-resolver";
import { synthesizePlanAudio } from "../audio/assemble-audio";
import { saySynthesizer } from "../audio/tts";
import { buildComposition } from "../compose/build-composition";
import { render } from "../render/render";

export async function run(prompt: string, outDir: string): Promise<string> {
  mkdirSync(join(outDir, "audio"), { recursive: true });
  mkdirSync(join(outDir, "renders"), { recursive: true });

  const ctx = promptToSourceContext(prompt);
  const plan = generatePlan(ctx);

  // VO drives timing: synthesize first, get content-driven durations + aligned vo.wav
  const { planWithTiming } = synthesizePlanAudio(plan, saySynthesizer, join(outDir, "audio"));

  buildComposition(planWithTiming, loadBrandTokens(), outDir, "audio/vo.wav");

  render(outDir, "renders/video.mp4");
  return join(outDir, "renders", "video.mp4");
}

if (import.meta.main) {
  const prompt = process.argv.slice(2).join(" ") || "Describe your feature here.";
  run(prompt, join(process.cwd(), "out/latest")).then((p) => console.log("Rendered:", p));
}
