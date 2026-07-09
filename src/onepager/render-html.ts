import type { VideoPlanV3 } from "../content-director/plan-schema";
import type { BrandTokens } from "../brand/token-resolver";
import { escapeHtml } from "../compose/scene-card";

/** Build a branded, print-optimized single-page enablement one-pager (self-contained HTML string). */
export function renderOnePagerHtml(
  plan: VideoPlanV3,
  t: BrandTokens,
  opts: { heroDataUri?: string; videoUrl?: string; docsUrl?: string; logoRelPath?: string } = {},
): string {
  const logo = opts.logoRelPath ?? "assets/uipath-logo-orange.png";
  const videoUrl = opts.videoUrl ?? "#";
  const docsUrl = opts.docsUrl ?? "#";
  const points = plan.talking_points
    .map((p) => `<li><span class="chk">&#10003;</span><span>${escapeHtml(p)}</span></li>`)
    .join("");
  const hero = opts.heroDataUri
    ? `<a class="hero" href="${escapeHtml(videoUrl)}"><img src="${opts.heroDataUri}" alt="Enablement video still"/><span class="play">&#9654; Watch the 2-min enablement video</span></a>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>${escapeHtml(plan.feature_name)} &mdash; Enablement one-pager</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  @page { size: A4; margin: 0; }
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{font-family:'${t.fontBody}',sans-serif;color:#1c2b33;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;display:flex;flex-direction:column;}
  .band{background:${t.deepBlue};color:${t.white};padding:26px 34px;display:flex;align-items:center;gap:22px;}
  .band img{height:52px;width:auto;}
  .band .eyebrow{font-weight:700;text-transform:uppercase;letter-spacing:.2em;font-size:11px;color:${t.teal};margin-bottom:6px;}
  .band .feature{font-family:'${t.fontHeadline}';font-weight:700;font-size:26px;line-height:1.1;letter-spacing:-0.02em;}
  .body{padding:30px 34px;flex:1;display:flex;flex-direction:column;gap:24px;}
  .value{font-family:'${t.fontHeadline}';font-weight:600;font-size:23px;line-height:1.3;color:#12202a;}
  .hero{display:block;position:relative;border-radius:14px;overflow:hidden;text-decoration:none;box-shadow:0 12px 34px rgba(0,0,0,.14);}
  .hero img{display:block;width:100%;height:auto;}
  .hero .play{position:absolute;left:16px;bottom:14px;background:${t.orange};color:#fff;font-weight:600;font-size:14px;padding:9px 15px;border-radius:999px;}
  .cols{display:flex;gap:26px;}
  .col{flex:1;background:#f4f6f7;border:1px solid #e3e8ea;border-left:4px solid ${t.teal};border-radius:12px;padding:18px 20px;}
  h3{font-family:'${t.fontBody}';font-weight:700;text-transform:uppercase;letter-spacing:.14em;font-size:12px;color:${t.teal};margin-bottom:10px;}
  .col p{font-size:15px;line-height:1.45;color:#33454f;}
  .position{background:#fff;border:1px solid #e3e8ea;border-top:4px solid ${t.orange};border-radius:12px;padding:20px 22px;}
  .position h3{color:${t.orange};}
  .points{list-style:none;display:flex;flex-direction:column;gap:12px;}
  .points li{display:flex;gap:13px;align-items:flex-start;font-size:15.5px;line-height:1.4;color:#22333c;}
  .chk{flex:0 0 auto;width:22px;height:22px;border-radius:50%;background:rgba(11,162,179,.14);color:${t.teal};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;}
  .footer{margin-top:auto;padding:18px 34px;border-top:1px solid #e3e8ea;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#6b7a82;}
  .footer .cta a{color:${t.orange};font-weight:600;text-decoration:none;}
  .footer .mark{font-weight:700;color:${t.deepBlue};letter-spacing:.08em;text-transform:uppercase;}
</style></head>
<body>
  <div class="page">
    <div class="band">
      <img src="${escapeHtml(logo)}" alt="UiPath"/>
      <div><div class="eyebrow">Enablement &middot; Internal Draft</div><div class="feature">${escapeHtml(plan.feature_name)}</div></div>
    </div>
    <div class="body">
      <div class="value">${escapeHtml(plan.value_prop)}</div>
      ${hero}
      <div class="cols">
        <div class="col"><h3>Who it's for</h3><p>${escapeHtml(plan.persona)}</p></div>
        <div class="col"><h3>When to use</h3><p>${escapeHtml(plan.when_to_use)}</p></div>
      </div>
      <div class="position"><h3>How to position it</h3><ul class="points">${points}</ul></div>
    </div>
    <div class="footer">
      <div class="cta">Docs: <a href="${escapeHtml(docsUrl)}">${escapeHtml(docsUrl)}</a> &middot; Generated from the merge &mdash; review before sharing externally</div>
      <div class="mark">UiPath</div>
    </div>
  </div>
</body></html>`;
}
