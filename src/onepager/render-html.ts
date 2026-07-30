import type { VideoPlanV3 } from "../content-director/plan-schema";
import type { BrandTokens } from "../brand/token-resolver";
import { escapeHtml } from "../compose/scene-card";

/** Build a branded, print-optimized single-page enablement one-pager (self-contained HTML string).
 *  No video embed — this is a sales leave-behind: value, fit, positioning, and objection-handling. */
export function renderOnePagerHtml(
  plan: VideoPlanV3,
  t: BrandTokens,
  opts: { heroDataUri?: string; videoUrl?: string; docsUrl?: string; logoRelPath?: string; logoDataUri?: string } = {},
): string {
  // Prefer an inline data-URI so the page is self-contained (the logo can't 404 when shown
  // standalone from a bucket, with no assets/ folder alongside it).
  const logo = opts.logoDataUri ?? opts.logoRelPath ?? "assets/uipath-logo-orange.png";
  const docsUrl = opts.docsUrl ?? "#";

  const points = plan.talking_points
    .map((p) => `<li><span class="chk">&#10003;</span><span>${escapeHtml(p)}</span></li>`)
    .join("");

  const objections = plan.objections ?? [];
  const qa = objections
    .map((o) => `<div class="qa"><div class="q">${escapeHtml(o.q)}</div><div class="a">${escapeHtml(o.a)}</div></div>`)
    .join("");
  const objectionsBlock = qa
    ? `<div class="objections"><h3>Objections, answered</h3><div class="qagrid">${qa}</div></div>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>${escapeHtml(plan.feature_name)} &mdash; Enablement one-pager</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  @page { size: A4; margin: 0; }
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{font-family:'${t.fontBody}',sans-serif;color:#1c2b33;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .page{width:210mm;height:297mm;margin:0 auto;background:#fff;display:flex;flex-direction:column;overflow:hidden;}
  .band{background:${t.deepBlue};color:${t.white};padding:15px 30px;display:flex;align-items:center;gap:18px;}
  .band img{height:40px;width:auto;}
  .band .eyebrow{font-weight:700;text-transform:uppercase;letter-spacing:.2em;font-size:10px;color:${t.teal};margin-bottom:4px;}
  .band .feature{font-family:'${t.fontHeadline}';font-weight:700;font-size:22px;line-height:1.1;letter-spacing:-0.02em;}
  .body{padding:17px 30px 6px;flex:1;display:flex;flex-direction:column;gap:11px;}
  .value{font-family:'${t.fontHeadline}';font-weight:600;font-size:17px;line-height:1.24;color:#12202a;}
  .chips{display:flex;flex-wrap:wrap;gap:8px;}
  .chip{display:inline-flex;align-items:center;gap:7px;background:rgba(250,70,22,.08);border:1px solid rgba(250,70,22,.28);color:#7a2c14;font-weight:600;font-size:11px;padding:5px 11px;border-radius:999px;}
  .chip i{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:${t.orange};color:#fff;font-size:9px;font-style:normal;}
  .cols{display:flex;gap:16px;}
  .col{flex:1;background:#f4f6f7;border:1px solid #e3e8ea;border-left:4px solid ${t.teal};border-radius:10px;padding:11px 15px;}
  h3{font-family:'${t.fontBody}';font-weight:700;text-transform:uppercase;letter-spacing:.14em;font-size:11px;color:${t.teal};margin-bottom:6px;}
  .col p{font-size:13px;line-height:1.4;color:#33454f;}
  .position{background:#fff;border:1px solid #e3e8ea;border-top:4px solid ${t.orange};border-radius:10px;padding:12px 16px;}
  .position h3{color:${t.orange};}
  .points{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;}
  .points li{display:flex;gap:9px;align-items:flex-start;font-size:12px;line-height:1.32;color:#22333c;}
  .chk{flex:0 0 auto;width:18px;height:18px;border-radius:50%;background:rgba(11,162,179,.14);color:${t.teal};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;}
  .objections h3{color:${t.deepBlue};margin-bottom:8px;}
  .qagrid{display:grid;grid-template-columns:1fr 1fr;gap:9px;}
  .qa{background:#f7f9fa;border:1px solid #e3e8ea;border-radius:9px;padding:10px 13px;position:relative;}
  .qa .q{font-family:'${t.fontHeadline}';font-weight:600;color:${t.deepBlue};font-size:12.5px;line-height:1.26;margin-bottom:4px;padding-left:19px;}
  .qa .q:before{content:"?";position:absolute;left:13px;top:11px;width:14px;height:14px;border-radius:50%;background:${t.orange};color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;}
  .qa .a{font-size:11.5px;line-height:1.38;color:#3a4b55;}
  .footer{margin-top:auto;padding:10px 30px;border-top:1px solid #e3e8ea;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#6b7a82;}
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
      <div class="cols">
        <div class="col"><h3>Who it's for</h3><p>${escapeHtml(plan.persona)}</p></div>
        <div class="col"><h3>When to use</h3><p>${escapeHtml(plan.when_to_use)}</p></div>
      </div>
      <div class="position"><h3>How to position it</h3><ul class="points">${points}</ul></div>
      ${objectionsBlock}
    </div>
    <div class="footer">
      <div class="cta">Docs: <a href="${escapeHtml(docsUrl)}">${escapeHtml(docsUrl)}</a> &middot; Capture, not publish &mdash; a human approves before anything ships externally</div>
      <div class="mark">UiPath</div>
    </div>
  </div>
</body></html>`;
}
