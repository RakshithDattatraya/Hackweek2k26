import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { validatePlanV3, isCustomScene } from "../content-director/plan-schema";
import { validateScenePlan } from "../scenes/registry";
import { loadBrandTokens } from "../brand/token-resolver";
import { synthesizePlanAudio } from "../audio/assemble-audio";
import { saySynthesizer, type SpeechSynthesizer } from "../audio/tts";
import { elevenlabsSynthesizer, hasElevenLabs } from "../audio/elevenlabs";
import { buildCompositionV2 } from "../compose/build-composition-v2";
import { render } from "../render/render";
import { runGate } from "../qa/gate";

export function pickSynthesizer(): SpeechSynthesizer {
  // Prefer ElevenLabs (expressive, natural) when a key is available.
  if (hasElevenLabs()) { console.log("Voice: ElevenLabs"); return elevenlabsSynthesizer; }
  try {
    const voices = execFileSync("say", ["-v", "?"]).toString();
    if (voices.includes("Ava (Premium)")) {
      return {
        synthesize(text, outWavPath) {
          const aiff = outWavPath.replace(/\.wav$/, ".aiff");
          execFileSync("say", ["-v", "Ava (Premium)", "-o", aiff, text]);
          execFileSync("ffmpeg", ["-y", "-i", aiff, "-ar", "44100", "-ac", "2", outWavPath], { stdio: "ignore" });
        },
      };
    }
  } catch { /* fall through */ }
  return saySynthesizer;
}

type Word = { text: string; start: number; end: number };

export async function buildFromPlan(planPath: string, outDir: string): Promise<string> {
  const plan = validatePlanV3(JSON.parse(readFileSync(planPath, "utf8")));
  validateScenePlan({ scenes: plan.scenes.filter((s: any) => !isCustomScene(s)) } as any);
  const tokens = loadBrandTokens();
  mkdirSync(join(outDir, "audio"), { recursive: true });
  mkdirSync(join(outDir, "renders"), { recursive: true });
  mkdirSync(join(outDir, "assets"), { recursive: true });
  execFileSync("cp", [join(process.cwd(), "brand/logos/uipath-logo-orange.png"), join(outDir, "assets/uipath-logo-orange.png")]);

  const { planWithTiming } = synthesizePlanAudio(plan as any, pickSynthesizer(), join(outDir, "audio"), 0.9);
  execFileSync("ffmpeg", ["-y", "-i", join(outDir, "audio/vo.wav"), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", join(outDir, "audio/vo-norm.wav")], { stdio: "ignore" });

  // captions (optional — skip if transcribe unavailable)
  let captionHtml = "";
  try {
    const nodeBin = process.env.HYPERFRAMES_NODE_BIN;
    const hfEnv = nodeBin ? { ...process.env, PATH: `${nodeBin}:${process.env.PATH}` } : process.env;
    execFileSync("npx", ["-y", "hyperframes@latest", "transcribe", "audio/vo-norm.wav", "--json", "--optional"], { cwd: outDir, env: hfEnv, stdio: "ignore" });
    const words = JSON.parse(readFileSync(join(outDir, "audio/transcript.json"), "utf8")) as Word[];
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const cues: { words: Word[]; start: number; end: number }[] = [];
    let cur: Word[] = [], len = 0;
    const flush = () => { if (cur.length) { cues.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; } };
    for (const w of words) { cur.push(w); len += w.text.length + 1; if (len >= 42 || cur.length >= 8 || /[.?!]$/.test(w.text.trim())) { flush(); len = 0; } }
    flush();
    captionHtml = cues.map((c) => `    <div class="cap" data-s="${c.start}" data-e="${c.end}">${c.words.map((w) => `<span class="capw" data-t="${w.start}">${esc(w.text)}</span>`).join(" ")}</div>`).join("\n");
  } catch { captionHtml = ""; }

  buildCompositionV2(planWithTiming as any, tokens, outDir, { audioRelPath: "audio/vo-norm.wav", captionHtml });
  render(outDir, "renders/video.mp4");

  const qa = runGate(plan as any, tokens, outDir);
  writeFileSync(join(outDir, "qa-report.json"), JSON.stringify(qa, null, 2));
  if (!qa.ok) console.warn(`QA gate found ${qa.findings.length} issue(s) — see qa-report.json (self-review loop / human should resolve).`);

  return join(outDir, "renders", "video.mp4");
}

export function snapshot(mp4Path: string, times: number[], outDir: string): string[] {
  const paths: string[] = [];
  times.forEach((t, i) => {
    const p = join(outDir, `frame-${i}.png`);
    execFileSync("ffmpeg", ["-y", "-ss", String(t), "-i", mp4Path, "-frames:v", "1", "-vf", "scale=960:-1", p], { stdio: "ignore" });
    paths.push(p);
  });
  return paths;
}

if (import.meta.main) {
  const planPath = process.argv[2] || "fixtures/sample-plan.v2.json";
  buildFromPlan(planPath, join(process.cwd(), "out/latest-v2")).then((p) => console.log("Rendered:", p));
}
