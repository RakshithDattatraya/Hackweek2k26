import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { VideoPlanV2 } from "../content-director/plan-schema";
import { isCustomScene } from "../content-director/plan-schema";
import type { BrandTokens } from "../brand/token-resolver";
import { renderScene } from "../scenes/registry";
import { renderCustomInner } from "../scenes/custom";
import { escapeHtml } from "./scene-card";

const PANEL = "#1e2c35", HAIR = "#33434d", MUTED = "#93a0a8", SUB = "#c4ccd2";
const GLOW = "radial-gradient(1150px 780px at 12% 6%, rgba(250,70,22,.10), transparent 58%),radial-gradient(1050px 720px at 90% 96%, rgba(11,162,179,.13), transparent 58%)";

export function buildCompositionV2(
  plan: VideoPlanV2, t: BrandTokens, outDir: string,
  opts: { audioRelPath?: string; captionHtml?: string } = {},
): { indexPath: string; totalDuration: number } {
  mkdirSync(join(outDir, "audio"), { recursive: true });

  const sceneCss: string[] = [];
  const motionSplices: string[] = [];
  const transitionSplices: string[] = [];

  // Precompute rounded cumulative boundaries to eliminate rounding drift
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const bounds: number[] = [0];
  for (const sc of plan.scenes as any[]) bounds.push(bounds[bounds.length - 1] + (sc.duration ?? 4));

  const clips = plan.scenes.map((s: any, i: number) => {
    const start = r2(bounds[i]);
    const dur = r2(bounds[i + 1]) - start;  // exact boundary difference; next clip's start === this start+dur
    const sid = s.id;
    const scopeSel = `[data-sid="${sid}"]`;
    let inner: string;
    let center = false;
    let ps = 1.03, py = 0, pe = "none", stg = 0.32;
    let ownMotion = false;
    if (isCustomScene(s)) {
      const r = renderCustomInner(s, scopeSel);
      inner = r.html;
      if (r.css) sceneCss.push(r.css);
      ownMotion = Boolean(s.motionScript);
      if (s.motionScript) motionSplices.push(
        `      (function(tl, root, start){ ${s.motionScript} })(tl, document.querySelector('${scopeSel}'), ${start.toFixed(2)});`);
      const m = s.motion ?? {};
      ps = m.pushScale ?? 1.03; py = m.pushY ?? 0; pe = m.ease ?? "none"; stg = m.stagger ?? 0.32;
    } else {
      const m = s.motion ?? {};
      const wantZoom = m.autoZoom ?? (s.component === "slack");
      ps = m.pushScale ?? (wantZoom ? 1.14 : 1.03);
      py = m.pushY ?? (wantZoom ? -32 : 0);
      pe = m.ease ?? (wantZoom ? "power2.inOut" : "none");
      stg = m.stagger ?? 0.32;
      center = ["intro", "cta", "bigstat"].includes(s.component);
      inner = renderScene(s, t);
    }
    const isLast = i === plan.scenes.length - 1;
    const overlap = isLast ? 0 : Math.max(0, s.transitionOverlap ?? 0);
    const winDur = dur + overlap;
    const track = i % 2;
    if (s.transitionOut) {
      transitionSplices.push(
        `      (function(tl, root, at){ ${s.transitionOut} })(tl, document.querySelector('[data-sid="${sid}"]'), ${(start + dur).toFixed(2)});`);
    }
    const cls = "clip scene" + (center ? " center" : "");
    return `    <div class="${cls}" data-sid="${sid}" data-start="${start.toFixed(2)}" data-duration="${winDur.toFixed(2)}" data-track-index="${track}" data-stagger="${stg}" data-ps="${ps}" data-py="${py}" data-pe="${pe}"${ownMotion ? ' data-own-motion="1"' : ''} style="z-index:${i};background:${GLOW}, ${t.deepBlue}">
      <div class="inner">${inner}</div>
    </div>`;
  }).join("\n");
  const totalDuration = r2(bounds[bounds.length - 1]);

  const tokenVars = `:root{--uip-orange:${t.orange};--uip-teal:${t.teal};--uip-deep-blue:${t.deepBlue};--uip-white:${t.white};--uip-font-head:'${t.fontHeadline}';--uip-font-body:'${t.fontBody}';}`;

  const audioEl = opts.audioRelPath
    ? `    <audio id="vo" src="${opts.audioRelPath}" data-start="0" data-duration="${totalDuration.toFixed(2)}" data-track-index="2"></audio>` : "";

  const html = `<!doctype html>
<html lang="en" data-resolution="landscape"><head><meta charset="UTF-8" />
<title>${escapeHtml(plan.feature_name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
${tokenVars}
${sceneCss.join("\n")}
  html,body{margin:0;padding:0;width:1920px;height:1080px;overflow:hidden;background:${t.deepBlue};font-family:'Inter',sans-serif;color:${t.white};-webkit-font-smoothing:antialiased;}
  #master-root{width:1920px;height:1080px;position:relative;}
  .scene{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding-bottom:180px;box-sizing:border-box;}
  .inner{width:1520px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;transform-origin:center center;}
  .scene.center .inner{align-items:center;text-align:center;}
  .eyebrow{font-family:'Inter';font-weight:700;text-transform:uppercase;letter-spacing:.2em;font-size:24px;margin-bottom:28px;display:flex;align-items:center;gap:14px;}
  .eyebrow i{display:inline-block;width:34px;height:4px;border-radius:2px;background:${t.orange};}
  h1{font-family:'Poppins';font-weight:700;font-size:94px;line-height:1.04;letter-spacing:-0.045em;margin:0;}
  h2{font-family:'Poppins';font-weight:700;font-size:70px;line-height:1.05;letter-spacing:-0.04em;margin:0;}
  .sub{font-family:'Inter';font-weight:400;font-size:33px;line-height:1.42;color:${SUB};margin:34px 0 0;max-width:1240px;}
  .logo{height:120px;width:auto;align-self:flex-start;flex:0 0 auto;}.scene.center .logo{align-self:center;}.logo.big{height:180px;}
  .introtag{font-family:'Poppins';font-weight:600;font-size:46px;letter-spacing:-0.02em;color:${SUB};margin-top:34px;}
  .bigstat-num{font-family:'Poppins';font-weight:900;font-size:220px;line-height:1;letter-spacing:-0.04em;}
  .bigstat-unit{font-size:120px;margin-left:10px;}
  .footer{position:absolute;left:64px;bottom:48px;font-family:'Inter';font-weight:600;font-size:22px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.28);display:flex;gap:12px;z-index:45;}
  .capscrim{position:absolute;left:0;right:0;bottom:0;height:220px;background:linear-gradient(transparent, rgba(0,0,0,.6));z-index:40;pointer-events:none;}
  .footer b{color:rgba(255,255,255,.5);font-weight:700;}
  .slackwin{width:1240px;height:660px;display:flex;border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 50px 110px rgba(0,0,0,.55);border:1px solid rgba(0,0,0,.1);}
  .slack-sb{width:290px;background:#3F0E40;color:#fff;padding:22px 0;flex:0 0 auto;}
  .sb-ws{font-family:'Poppins';font-weight:700;font-size:27px;padding:4px 22px 20px;border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:16px;display:flex;gap:8px;}
  .sb-caret{font-size:18px;opacity:.7;}.sb-sec{color:rgba(255,255,255,.6);font-size:19px;font-weight:600;padding:0 22px 8px;}
  .sb-ch{font-size:23px;color:rgba(255,255,255,.72);padding:9px 22px;display:flex;gap:8px;}.sb-hash{opacity:.55;}
  .sb-ch.active{background:#1164A3;color:#fff;font-weight:600;}
  .slack-main{flex:1;display:flex;flex-direction:column;background:#fff;}
  .slack-hd{padding:20px 30px;border-bottom:1px solid #e2e2e2;display:flex;align-items:baseline;}
  .hd-ch{font-family:'Poppins';font-weight:700;font-size:28px;color:#1d1c1d;}.hd-meta{font-size:20px;color:#616061;}
  .slack-body{flex:1;padding:20px 30px;display:flex;flex-direction:column;gap:22px;}
  .srow{display:flex;gap:18px;align-items:flex-start;}
  .savatar{flex:0 0 46px;width:46px;height:46px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-family:'Poppins';font-weight:700;font-size:19px;color:#fff;}
  .scol{display:flex;flex-direction:column;gap:3px;}.shead{display:flex;align-items:baseline;gap:12px;}
  .sname{font-family:'Poppins';font-weight:700;font-size:25px;color:#1d1c1d;}.stime{font-size:18px;color:#616061;}
  .stext{font-size:26px;line-height:1.34;color:#1d1c1d;}.stext b{font-weight:700;}
  .slack-compose{margin:0 30px 26px;border:1px solid #b9b9b9;border-radius:12px;padding:18px 22px;color:#8d8d8d;font-size:23px;}
  .gapviz{display:flex;align-items:stretch;width:100%;}
  .shore{flex:1;background:${PANEL};border:2px solid ${HAIR};border-top-width:5px;border-radius:18px;padding:40px 40px 44px;text-align:left;}
  .shore-icon{width:74px;height:74px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:700;margin-bottom:26px;}
  .shore-t{font-family:'Poppins';font-weight:700;font-size:42px;margin-bottom:12px;}.shore-s{font-size:28px;color:${SUB};line-height:1.4;}
  .chasm{flex:0 0 340px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;}
  .chasm-line{width:100%;height:0;border-top:4px dashed ${MUTED};opacity:.5;}
  .chasm-dot{width:16px;height:16px;border-radius:50%;position:absolute;top:calc(50% - 8px);left:calc(50% - 8px);box-shadow:0 0 24px 6px rgba(250,70,22,.5);}
  .chasm-lbl{position:absolute;top:calc(50% + 24px);left:50%;transform:translateX(-50%);width:250px;text-align:center;font-size:19px;line-height:1.35;color:${MUTED};text-transform:uppercase;letter-spacing:.07em;}
  .flow{display:flex;align-items:center;flex-wrap:wrap;gap:20px;margin-top:14px;}
  .node{background:${PANEL};border:2px solid ${HAIR};border-radius:16px;padding:26px 30px;font-family:'Poppins';font-weight:600;font-size:32px;color:#eef2f4;white-space:nowrap;display:flex;align-items:center;gap:14px;}
  .node-ic{font-size:34px;}.arrow{font-size:42px;color:${MUTED};}
  .caps{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:28px;width:100%;}
  .caps li{display:flex;gap:26px;align-items:center;font-size:37px;}
  .capic{flex:0 0 76px;width:76px;height:76px;border-radius:16px;background:${PANEL};border:1px solid ${HAIR};display:flex;align-items:center;justify-content:center;font-size:38px;}
  .caps b{font-family:'Poppins';font-weight:600;display:block;}.capd{display:block;font-size:27px;color:#aab4bb;margin-top:5px;}
  .ctacard{background:#fff;border-radius:26px;padding:52px 68px;box-shadow:0 34px 90px rgba(0,0,0,.45);}.ctacard .logo{height:92px;align-self:center;}
  .cap{position:absolute;left:50%;bottom:56px;transform:translateX(-50%);width:1200px;text-align:center;font-family:'Inter';font-weight:600;font-size:37px;line-height:1.3;text-shadow:0 2px 22px rgba(0,0,0,.75);pointer-events:none;z-index:50;}
  .capw{color:rgba(255,255,255,.4);}
</style></head>
<body>
  <div id="master-root" data-composition-id="feature-video" data-start="0" data-width="1920" data-height="1080">
${clips}
    <div class="capscrim"></div>
${opts.captionHtml ?? ""}
    <div class="footer"><b>UiPath</b> · Enablement</div>
${audioEl}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    document.querySelectorAll('.scene').forEach((scene) => {
      const start = parseFloat(scene.dataset.start);
      const dur = parseFloat(scene.dataset.duration);
      const stagger = parseFloat(scene.dataset.stagger) || 0.14;
      const inner = scene.querySelector('.inner');
      tl.fromTo(inner, { scale: 1, y: 0 }, { scale: parseFloat(scene.dataset.ps), y: parseFloat(scene.dataset.py), duration: dur, ease: scene.dataset.pe || 'none' }, start);
      const kids = scene.querySelectorAll('.anim');
      if (kids.length && !scene.dataset.ownMotion) tl.from(kids, { autoAlpha: 0, y: 44, duration: 0.6, stagger: stagger, ease: 'back.out(1.6)' }, start + 0.28);
    });
    document.querySelectorAll('.cap').forEach((cap) => {
      const s = parseFloat(cap.dataset.s), e = parseFloat(cap.dataset.e);
      tl.fromTo(cap, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.22, ease: 'power2.out' }, Math.max(0, s - 0.08));
      tl.to(cap, { autoAlpha: 0, duration: 0.2, ease: 'power1.in' }, e + 0.18);
      cap.querySelectorAll('.capw').forEach((w) => { tl.to(w, { color: '#ffffff', duration: 0.12 }, parseFloat(w.dataset.t)); });
    });
    // custom-scene authored motion (spliced; determinism enforced by QA lint)
${motionSplices.join("\n")}
    // authored seam transitions (outgoing scene animates out during the overlap)
${transitionSplices.join("\n")}
    window.__timelines["feature-video"] = tl;
  </script>
</body></html>`;

  const indexPath = join(outDir, "index.html");
  writeFileSync(indexPath, html);
  writeFileSync(join(outDir, "meta.json"), JSON.stringify({ id: "feature-video", name: plan.feature_name, duration: totalDuration, width: 1920, height: 1080, fps: 30 }, null, 2));
  return { indexPath, totalDuration };
}
