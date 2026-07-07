import type { Scene } from "../content-director/plan-schema";
import type { BrandTokens } from "../brand/token-resolver";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

export function sceneCard(scene: Scene, startSec: number, tokens: BrandTokens, trackIndex = 0): string {
  const bg = scene.type === "cta" ? tokens.orange : tokens.deepBlue;
  return `  <div class="clip scene" data-start="${startSec}" data-duration="${scene.duration}" data-track-index="${trackIndex}"
       style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:120px;box-sizing:border-box;background:${bg};color:${tokens.white};font-family:'${tokens.fontHeadline}',sans-serif;">
    <div class="eyebrow" style="font-family:'${tokens.fontBody}',sans-serif;text-transform:uppercase;letter-spacing:0.12em;color:${tokens.teal};font-size:28px;margin-bottom:24px;">${escapeHtml(scene.type)}</div>
    <div class="headline" style="font-weight:700;font-size:84px;line-height:1.05;letter-spacing:-0.045em;max-width:1400px;">${escapeHtml(scene.on_screen_text)}</div>
  </div>`;
}
