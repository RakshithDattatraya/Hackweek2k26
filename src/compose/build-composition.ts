import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { VideoPlan } from "../content-director/plan-schema";
import type { BrandTokens } from "../brand/token-resolver";
import { sceneCard, escapeHtml } from "./scene-card";

export function buildComposition(
  plan: VideoPlan,
  tokens: BrandTokens,
  outDir: string,
  audioRelPath?: string,
): { indexPath: string; totalDuration: number } {
  mkdirSync(join(outDir, "audio"), { recursive: true });

  let t = 0;
  const clips = plan.scenes
    .map((s) => {
      const card = sceneCard(s, t, tokens);
      t += s.duration;
      return card;
    })
    .join("\n");
  const totalDuration = t;

  const audioEl = audioRelPath
    ? `  <audio id="vo" src="${audioRelPath}" data-start="0" data-duration="${totalDuration}" data-track-index="1"></audio>`
    : "";

  const html = `<!doctype html>
<html lang="en" data-resolution="landscape">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(plan.feature_name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;900&family=Inter:wght@400;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    html, body { margin: 0; padding: 0; width: 1920px; height: 1080px; overflow: hidden; background: ${tokens.deepBlue}; }
    #master-root { width: 1920px; height: 1080px; position: relative; }
  </style>
</head>
<body>
  <div id="master-root" data-composition-id="enablement" data-start="0" data-width="1920" data-height="1080">
${clips}
${audioEl}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    document.querySelectorAll('.scene').forEach((el) => {
      const start = parseFloat(el.getAttribute('data-start'));
      tl.fromTo(el, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'back.out(1.4)' }, start);
    });
    window.__timelines["enablement"] = tl;
  </script>
</body>
</html>`;

  const indexPath = join(outDir, "index.html");
  writeFileSync(indexPath, html);
  writeFileSync(
    join(outDir, "meta.json"),
    JSON.stringify({ id: "enablement", name: plan.feature_name, duration: totalDuration, width: 1920, height: 1080, fps: 30 }, null, 2),
  );
  return { indexPath, totalDuration };
}
