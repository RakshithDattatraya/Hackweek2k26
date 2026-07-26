import type { ReleasePlan } from "../content-director/release-plan-schema";
import type { BrandTokens } from "../brand/token-resolver";
import { escapeHtml } from "../compose/scene-card";

const GROUP_ORDER = ["New capabilities", "Improvements", "Fixes that matter"] as const;

/** Build a branded, print-optimized single-page release one-pager (self-contained HTML string).
 *  No video embed — multiple grouped highlights across a release, for internal enablement. */
export function renderReleaseOnePagerHtml(
  plan: ReleasePlan,
  t: BrandTokens,
  opts: { logoRelPath?: string; notesUrl?: string } = {},
): string {
  const logo = opts.logoRelPath ?? "assets/uipath-logo-orange.png";
  const notesUrl = opts.notesUrl ?? plan.notes_url;

  const groupSections = GROUP_ORDER.map((group) => {
    const items = plan.highlights.filter((h) => h.group === group);
    if (items.length === 0) return "";
    const rows = items
      .map(
        (h) => `<li>
          <div class="htitle">${escapeHtml(h.title)}</div>
          <div class="hvalue">${escapeHtml(h.value_line)}</div>
          <span class="chip">${escapeHtml(h.persona)}</span>
        </li>`,
      )
      .join("");
    return `<div class="col"><h3>${escapeHtml(group)}</h3><ul class="highlights">${rows}</ul></div>`;
  })
    .filter(Boolean)
    .join("");

  const longTailBlock =
    plan.long_tail.length > 0
      ? `<div class="longtail"><h3>Also in this release</h3><p>${plan.long_tail
          .map((lt) => escapeHtml(lt.title))
          .join(" &middot; ")}</p></div>`
      : "";

  const customerPoints = plan.what_to_tell_customers
    .map((p) => `<li><span class="chk">&#10003;</span><span>${escapeHtml(p)}</span></li>`)
    .join("");
  const customerBlock =
    plan.what_to_tell_customers.length > 0
      ? `<div class="position"><h3>What to tell customers</h3><ul class="points">${customerPoints}</ul></div>`
      : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>${escapeHtml(plan.release_name)} ${escapeHtml(plan.version)} &mdash; Release one-pager</title>
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
  .band .version{font-family:'${t.fontBody}';font-weight:600;font-size:12px;color:${t.teal};margin-left:auto;}
  .body{padding:17px 30px 6px;flex:1;display:flex;flex-direction:column;gap:11px;}
  .theme{font-family:'${t.fontHeadline}';font-weight:600;font-size:17px;line-height:1.24;color:#12202a;}
  .cols{display:flex;gap:16px;}
  .col{flex:1;background:#f4f6f7;border:1px solid #e3e8ea;border-left:4px solid ${t.teal};border-radius:10px;padding:11px 15px;}
  h3{font-family:'${t.fontBody}';font-weight:700;text-transform:uppercase;letter-spacing:.14em;font-size:11px;color:${t.teal};margin-bottom:6px;}
  .highlights{list-style:none;display:flex;flex-direction:column;gap:8px;}
  .highlights li{border-top:1px solid #e3e8ea;padding-top:6px;}
  .highlights li:first-child{border-top:none;padding-top:0;}
  .htitle{font-family:'${t.fontHeadline}';font-weight:700;font-size:12.5px;color:${t.deepBlue};}
  .hvalue{font-size:11.5px;line-height:1.32;color:#5b6b73;margin:2px 0 4px;}
  .chip{display:inline-flex;align-items:center;gap:5px;background:rgba(11,162,179,.1);border:1px solid rgba(11,162,179,.28);color:#0a5a63;font-weight:600;font-size:10px;padding:3px 9px;border-radius:999px;}
  .longtail{background:#f7f9fa;border:1px solid #e3e8ea;border-radius:10px;padding:10px 15px;}
  .longtail h3{color:${t.deepBlue};}
  .longtail p{font-size:12px;line-height:1.4;color:#33454f;}
  .position{background:#fff;border:1px solid #e3e8ea;border-top:4px solid ${t.orange};border-radius:10px;padding:12px 16px;}
  .position h3{color:${t.orange};}
  .points{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;}
  .points li{display:flex;gap:9px;align-items:flex-start;font-size:12px;line-height:1.32;color:#22333c;}
  .chk{flex:0 0 auto;width:18px;height:18px;border-radius:50%;background:rgba(250,70,22,.12);color:${t.orange};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;}
  .footer{margin-top:auto;padding:10px 30px;border-top:1px solid #e3e8ea;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#6b7a82;}
  .footer .cta a{color:${t.orange};font-weight:600;text-decoration:none;}
  .footer .mark{font-weight:700;color:${t.deepBlue};letter-spacing:.08em;text-transform:uppercase;}
</style></head>
<body>
  <div class="page">
    <div class="band">
      <img src="${escapeHtml(logo)}" alt="UiPath"/>
      <div><div class="eyebrow">Release Enablement &middot; Internal</div><div class="feature">${escapeHtml(plan.release_name)}</div></div>
      <div class="version">${escapeHtml(plan.version)}</div>
    </div>
    <div class="body">
      <div class="theme">${escapeHtml(plan.theme)}</div>
      <div class="cols">${groupSections}</div>
      ${longTailBlock}
      ${customerBlock}
    </div>
    <div class="footer">
      <div class="cta">Full release notes: <a href="${escapeHtml(notesUrl)}">${escapeHtml(notesUrl)}</a></div>
      <div class="mark">UiPath</div>
    </div>
  </div>
</body></html>`;
}
