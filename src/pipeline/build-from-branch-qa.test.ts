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
  const qa = JSON.parse(readFileSync(join(outDir, "qa-report.json"), "utf8"));
  expect(typeof qa.ok).toBe("boolean");
  expect(Array.isArray(qa.findings)).toBe(true);
  const hasAudio = execFileSync("ffprobe", ["-v","error","-select_streams","a","-show_entries","stream=codec_type","-of","default=noprint_wrappers=1:nokey=1", out]).toString().trim();
  expect(hasAudio).toBe("audio");
  rmSync(dir, { recursive: true, force: true });
}, 300000);
