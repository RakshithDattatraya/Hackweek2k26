import { test, expect } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildFromBranch } from "./build-from-branch";

test("footage path applies the camera move (clip-cam.mp4 produced) and still renders", async () => {
  const dir = join(process.cwd(), "out/test-branch-zoom"); rmSync(dir, { recursive: true, force: true });
  execFileSync("mkdir", ["-p", dir]);
  const clip = join(dir, "demo.mp4");
  execFileSync("ffmpeg", ["-y","-f","lavfi","-i","testsrc=size=1920x1080:rate=30","-t","2","-pix_fmt","yuv420p", clip], { stdio: "ignore" });
  const plan = {
    feature_name: "F", value_prop: "v", persona: "p", when_to_use: "w", talking_points: ["t"],
    scenes: [
      { id: "hook", html: "<div style='color:var(--uip-white)'>Hook</div>", narration: "The hook." },
      { id: "demo", footage: { narration: "In action.", clipPath: clip, zoom: [ { at: 0, scale: 1 }, { at: 2, scale: 1.12, x: 0.7, y: 0.4 } ] } },
    ],
    youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
  };
  const planPath = join(dir, "plan.json");
  execFileSync("bash", ["-lc", `cat > '${planPath}'`], { input: JSON.stringify(plan) });
  const outDir = join(dir, "out");
  const out = await buildFromBranch(planPath, outDir);
  expect(existsSync(join(outDir, "clip-cam.mp4"))).toBe(true);
  expect(existsSync(out)).toBe(true);
  const hasAudio = execFileSync("ffprobe", ["-v","error","-select_streams","a","-show_entries","stream=codec_type","-of","default=noprint_wrappers=1:nokey=1", out]).toString().trim();
  expect(hasAudio).toBe("audio");
  rmSync(dir, { recursive: true, force: true });
}, 300000);
