import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { renderSegment } from "./render-segment";

test("renderSegment renders a subset of scenes to an mp4 with VO audio", () => {
  const dir = join(process.cwd(), "out/test-segment"); rmSync(dir, { recursive: true, force: true });
  const scenes = [
    { id: "a", html: "<div style='color:var(--uip-white)'>Alpha</div>", narration: "Alpha beat." },
    { id: "b", html: "<div style='color:var(--uip-white)'>Beta</div>", narration: "Beta beat." },
  ];
  const r = renderSegment(scenes as any, dir);
  expect(existsSync(r.videoPath)).toBe(true);
  expect(existsSync(r.voPath)).toBe(true);
  expect(r.duration).toBeGreaterThan(0);
  const hasAudio = execFileSync("ffprobe", ["-v","error","-select_streams","a","-show_entries","stream=codec_type","-of","default=noprint_wrappers=1:nokey=1", r.videoPath]).toString().trim();
  expect(hasAudio).toBe("audio");
  rmSync(dir, { recursive: true, force: true });
}, 180000);
