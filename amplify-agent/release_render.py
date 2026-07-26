"""In-cloud release renderer — a faithful Python port of the TS release renderers
(src/onepager/render-release-html.ts + src/release/build-digest.ts).

The one-pager and digest are pure HTML strings, so they render in the serverless
runtime with no Chrome/FFmpeg/bun — the agent builds them and uploads to the bucket
itself. (Video is NOT here: it needs the toolchain and runs via the TS pipeline on a
machine that has it. This port is release-only and does not touch the video path.)

Brand tokens are copied verbatim from brand/uipath-tokens.json (the design-token
source of truth) so the output stays on-brand and matches the TS renderer 1:1.
"""
from __future__ import annotations
from typing import Any

from brand_logo import LOGO_DATA_URI

# --- brand tokens (verbatim from brand/uipath-tokens.json, via token-resolver) ---
ORANGE = "#FA4616"       # roboticOrange — HERO
TEAL = "#0BA2B3"         # agenticTeal
DEEP_BLUE = "#182126"    # deepBlue
WHITE = "#FFFFFF"        # brightWhite
FONT_HEAD = "Poppins"    # typography.headline.family
FONT_BODY = "Inter"      # typography.body.family

GROUP_ORDER = ["New capabilities", "Improvements", "Fixes that matter"]


def escape_html(s: Any) -> str:
    # Mirrors compose/scene-card escapeHtml: & < > " ' .
    return (
        str("" if s is None else s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def render_release_onepager_html(plan: dict) -> str:
    """Branded, print-optimized single-page release one-pager (self-contained HTML)."""
    release_name = plan.get("release_name", "")
    version = plan.get("version", "")
    theme = plan.get("theme", "")
    notes_url = plan.get("notes_url", "") or ""
    highlights = plan.get("highlights") or []
    long_tail = plan.get("long_tail") or []
    customers = plan.get("what_to_tell_customers") or []

    glance = plan.get("at_a_glance")
    glance_block = f'<div class="glance">{escape_html(glance)}</div>' if glance else ""

    group_sections = []
    for group in GROUP_ORDER:
        items = [h for h in highlights if (h.get("group") == group)]
        if not items:
            continue
        rows = "".join(
            f"""<li>
          <div class="htitle">{escape_html(h.get("title"))}</div>
          <div class="hvalue">{escape_html(h.get("value_line"))}</div>
          <span class="chip">{escape_html(h.get("persona"))}</span>
        </li>"""
            for h in items
        )
        group_sections.append(
            f'<div class="col"><h3>{escape_html(group)}</h3><ul class="highlights">{rows}</ul></div>'
        )
    group_sections_html = "".join(group_sections)

    long_tail_block = ""
    if long_tail:
        titles = " &middot; ".join(escape_html(lt.get("title")) for lt in long_tail)
        long_tail_block = (
            f'<div class="longtail"><h3>Also in this release</h3><p>{titles}</p></div>'
        )

    customer_block = ""
    if customers:
        pts = "".join(
            f'<li><span class="chk">&#10003;</span><span>{escape_html(p)}</span></li>'
            for p in customers
        )
        customer_block = (
            f'<div class="position"><h3>What to tell customers</h3><ul class="points">{pts}</ul></div>'
        )

    logo = LOGO_DATA_URI
    return f"""<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>{escape_html(release_name)} {escape_html(version)} &mdash; Release one-pager</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  @page {{ size: A4; margin: 0; }}
  *{{box-sizing:border-box;margin:0;padding:0;}}
  html,body{{font-family:'{FONT_BODY}',sans-serif;color:#1c2b33;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  .page{{width:210mm;height:297mm;margin:0 auto;background:#fff;display:flex;flex-direction:column;overflow:hidden;}}
  .band{{background:{DEEP_BLUE};color:{WHITE};padding:15px 30px;display:flex;align-items:center;gap:18px;}}
  .band img{{height:40px;width:auto;}}
  .band .eyebrow{{font-weight:700;text-transform:uppercase;letter-spacing:.2em;font-size:10px;color:{TEAL};margin-bottom:4px;}}
  .band .feature{{font-family:'{FONT_HEAD}';font-weight:700;font-size:22px;line-height:1.1;letter-spacing:-0.02em;}}
  .band .version{{font-family:'{FONT_BODY}';font-weight:600;font-size:12px;color:{TEAL};margin-left:auto;}}
  .body{{padding:17px 30px 6px;flex:1;display:flex;flex-direction:column;gap:11px;}}
  .theme{{font-family:'{FONT_HEAD}';font-weight:600;font-size:17px;line-height:1.24;color:#12202a;}}
  .glance{{font-size:11.5px;font-weight:600;letter-spacing:.02em;color:{ORANGE};margin-top:-4px;}}
  .cols{{display:flex;gap:16px;}}
  .col{{flex:1;background:#f4f6f7;border:1px solid #e3e8ea;border-left:4px solid {TEAL};border-radius:10px;padding:11px 15px;}}
  h3{{font-family:'{FONT_BODY}';font-weight:700;text-transform:uppercase;letter-spacing:.14em;font-size:11px;color:{TEAL};margin-bottom:6px;}}
  .highlights{{list-style:none;display:flex;flex-direction:column;gap:8px;}}
  .highlights li{{border-top:1px solid #e3e8ea;padding-top:6px;}}
  .highlights li:first-child{{border-top:none;padding-top:0;}}
  .htitle{{font-family:'{FONT_HEAD}';font-weight:700;font-size:12.5px;color:{DEEP_BLUE};}}
  .hvalue{{font-size:11.5px;line-height:1.32;color:#5b6b73;margin:2px 0 4px;}}
  .chip{{display:inline-flex;align-items:center;gap:5px;background:rgba(11,162,179,.1);border:1px solid rgba(11,162,179,.28);color:#0a5a63;font-weight:600;font-size:10px;padding:3px 9px;border-radius:999px;}}
  .longtail{{background:#f7f9fa;border:1px solid #e3e8ea;border-radius:10px;padding:10px 15px;}}
  .longtail h3{{color:{DEEP_BLUE};}}
  .longtail p{{font-size:12px;line-height:1.4;color:#33454f;}}
  .position{{background:#fff;border:1px solid #e3e8ea;border-top:4px solid {ORANGE};border-radius:10px;padding:12px 16px;}}
  .position h3{{color:{ORANGE};}}
  .points{{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;}}
  .points li{{display:flex;gap:9px;align-items:flex-start;font-size:12px;line-height:1.32;color:#22333c;}}
  .chk{{flex:0 0 auto;width:18px;height:18px;border-radius:50%;background:rgba(250,70,22,.12);color:{ORANGE};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;}}
  .footer{{margin-top:auto;padding:10px 30px;border-top:1px solid #e3e8ea;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#6b7a82;}}
  .footer .cta a{{color:{ORANGE};font-weight:600;text-decoration:none;}}
  .footer .mark{{font-weight:700;color:{DEEP_BLUE};letter-spacing:.08em;text-transform:uppercase;}}
</style></head>
<body>
  <div class="page">
    <div class="band">
      <img src="{escape_html(logo)}" alt="UiPath"/>
      <div><div class="eyebrow">Release Enablement &middot; Internal</div><div class="feature">{escape_html(release_name)}</div></div>
      <div class="version">{escape_html(version)}</div>
    </div>
    <div class="body">
      <div class="theme">{escape_html(theme)}</div>
      {glance_block}
      <div class="cols">{group_sections_html}</div>
      {long_tail_block}
      {customer_block}
    </div>
    <div class="footer">
      <div class="cta">Full release notes: <a href="{escape_html(notes_url)}">{escape_html(notes_url)}</a></div>
      <div class="mark">UiPath</div>
    </div>
  </div>
</body></html>"""


def build_digest_html(plan: dict) -> str:
    """Confluence-ready digest HTML (port of buildDigest's confluenceHtml)."""
    release_name = plan.get("release_name", "")
    version = plan.get("version", "")
    theme = plan.get("theme", "")
    notes_url = plan.get("notes_url", "") or ""
    top = (plan.get("highlights") or [])[:5]
    customers = plan.get("what_to_tell_customers") or []

    def li(s: Any) -> str:
        return f"<li>{escape_html(s)}</li>"

    parts = [
        f"<h1>{escape_html(release_name)} {escape_html(version)}</h1>",
        f"<p><em>{escape_html(theme)}</em></p>",
        "<h2>Highlights</h2><ul>",
        *[li(f"{h.get('title')} — {h.get('value_line')} (for {h.get('persona')})") for h in top],
        "</ul>",
        (
            f"<h2>What to tell customers</h2><ul>{''.join(li(p) for p in customers)}</ul>"
            if customers
            else ""
        ),
        f'<p><a href="{escape_html(notes_url)}">Full release notes</a></p>',
    ]
    return "".join(parts)


def build_digest_slack(plan: dict) -> str:
    """Slack-ready digest markdown (port of buildDigest's slackMarkdown)."""
    release_name = plan.get("release_name", "")
    version = plan.get("version", "")
    theme = plan.get("theme", "")
    notes_url = plan.get("notes_url", "") or ""
    top = (plan.get("highlights") or [])[:5]
    customers = plan.get("what_to_tell_customers") or []
    lines = [
        f"*{release_name} {version} is out* — {theme}",
        *[f"• *{h.get('title')}* — {h.get('value_line')} _(for {h.get('persona')})_" for h in top],
        (f"\n*What to tell customers:* {' '.join(customers)}" if customers else ""),
        f"🔗 Full notes: {notes_url}",
    ]
    return "\n".join(x for x in lines if x)
