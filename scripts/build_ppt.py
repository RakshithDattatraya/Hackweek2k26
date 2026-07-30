#!/usr/bin/env python3
"""Build the Amplify submission deck (4 slides) on the UiPath template,
with graphical elements: concept flow, pain cards, a gap chart, an Azure-style
pipeline chevron flow, output chips, a stand-out band, and benefit badges."""
import copy
from pptx import Presentation
from pptx.util import Pt, Emu, Inches
from pptx.dml.color import RGBColor
from pptx.oxml.ns import qn
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
_A = MSO_ANCHOR

# ---- UiPath brand palette ----
ORANGE = RGBColor(0xFA, 0x46, 0x16)
INK = RGBColor(0x1B, 0x1B, 0x38)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
LGRAY = RGBColor(0xF2, 0xF2, 0xF5)
MGRAY = RGBColor(0x6E, 0x6E, 0x80)
DGRAY = RGBColor(0xCF, 0xCF, 0xD8)
TEAL = RGBColor(0x11, 0xB0, 0xA3)


def IN(v):
    return Inches(v)


def _clone_rpr(run):
    rpr = run._r.find(qn("a:rPr"))
    return copy.deepcopy(rpr) if rpr is not None else None


def fill(tf, items, size=None, bold=None, color=None, space_after=6):
    """Rewrite a text frame preserving the first run's formatting (used for the
    template's own boxes: team card + the Details table)."""
    src = None
    if tf.paragraphs and tf.paragraphs[0].runs:
        src = _clone_rpr(tf.paragraphs[0].runs[0])
    tf.word_wrap = True
    tf.clear()
    for i, item in enumerate(items):
        text, opts = (item if isinstance(item, tuple) else (item, {}))
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.space_after = Pt(opts.get("space_after", space_after))
        run = para.add_run()
        run.text = text
        if src is not None:
            old = run._r.find(qn("a:rPr"))
            if old is not None:
                run._r.remove(old)
            run._r.insert(0, copy.deepcopy(src))
        f = run.font
        sz = opts.get("size", size)
        if sz is not None:
            f.size = Pt(sz)
        bd = opts.get("bold", bold)
        if bd is not None:
            f.bold = bd
        cl = opts.get("color", color)
        if cl is not None:
            f.color.rgb = cl


def find(slide, name_starts):
    for sh in slide.shapes:
        if sh.has_text_frame and sh.name.startswith(name_starts):
            return sh
    return None


def remove_shape(sh):
    sh._element.getparent().remove(sh._element)


# ---- graphics helpers ----
def lines_into(tf, lines, anchor=MSO_ANCHOR.TOP, wrap=True, m=0.04):
    tf.word_wrap = wrap
    tf.vertical_anchor = anchor
    tf.margin_left = IN(m); tf.margin_right = IN(m)
    tf.margin_top = IN(0.02); tf.margin_bottom = IN(0.02)
    for i, ln in enumerate(lines):
        t, sz, bd, col, al, sa = ln
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = al
        p.space_after = Pt(sa)
        p.space_before = Pt(0)
        r = p.add_run(); r.text = t
        f = r.font; f.size = Pt(sz); f.bold = bd; f.name = "Arial"
        if col is not None:
            f.color.rgb = col


def L(t, sz, bd=False, col=INK, al=PP_ALIGN.LEFT, sa=2):
    return (t, sz, bd, col, al, sa)


def box(slide, x, y, w, h, lines, anchor=MSO_ANCHOR.TOP):
    tb = slide.shapes.add_textbox(IN(x), IN(y), IN(w), IN(h))
    lines_into(tb.text_frame, lines, anchor)
    return tb


def shape(slide, kind, x, y, w, h, fill_rgb=None, line_rgb=None, line_w=1.0, radius=None):
    sp = slide.shapes.add_shape(kind, IN(x), IN(y), IN(w), IN(h))
    sp.shadow.inherit = False
    if fill_rgb is None:
        sp.fill.background()
    else:
        sp.fill.solid(); sp.fill.fore_color.rgb = fill_rgb
    if line_rgb is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = line_rgb; sp.line.width = Pt(line_w)
    if radius is not None:
        try:
            sp.adjustments[0] = radius
        except Exception:
            pass
    return sp


def card(slide, kind, x, y, w, h, lines, fill_rgb, line_rgb=None, radius=0.12,
         anchor=MSO_ANCHOR.MIDDLE):
    sp = shape(slide, kind, x, y, w, h, fill_rgb, line_rgb, radius=radius)
    lines_into(sp.text_frame, lines, anchor, m=0.12)
    return sp


p = Presentation("template.pptx")

# ===================================================================
# SLIDE 0 — Title cover: Amplify wordmark + tagline + concept flow strip
# ===================================================================
s0 = p.slides[0]
box(s0, 0.7, 1.75, 12.0, 2.0, [
    L("Amplify", 66, True, WHITE, PP_ALIGN.LEFT, 4),
    L("Every ship, amplified to sales.", 26, False, WHITE, PP_ALIGN.LEFT, 0),
])

# ===================================================================
# SLIDE 1 — Team
# ===================================================================
s1 = p.slides[1]
head = find(s1, "Headline goes here")
if head:
    fill(head.text_frame, [("Team.", {})])
# remove the template's photo frames + name boxes; draw colorful monogram cards
for sh in list(s1.shapes):
    if sh.name.startswith("Jane Doe") or (sh.shape_type == 1 and not (sh.has_text_frame and sh.text_frame.text.strip())):
        remove_shape(sh)

BLUE = RGBColor(0x2D, 0x6C, 0xDF)
VIOLET = RGBColor(0x7A, 0x5C, 0xFF)
members = [
    ("Rakshith Hegde", "Software Engineer 2", "rakshith.hegde@uipath.com", "RH", ORANGE, RGBColor(0xFD, 0xEA, 0xE1)),
    ("Sandeep Rao", "Principal Software Engineer", "sandeep.rao@uipath.com", "SR", TEAL, RGBColor(0xE2, 0xF6, 0xF4)),
    ("Bhavana MS", "Senior Engineering Manager", "bhavana.ms@uipath.com", "BM", BLUE, RGBColor(0xE8, 0xEF, 0xFC)),
    ("Irina Capatina", "Senior Product Manager", "irina.capatina@uipath.com", "IC", VIOLET, RGBColor(0xEE, 0xEA, 0xFF)),
]
xs = [0.55, 3.73, 6.91, 10.09]
cw, cy, chh = 2.69, 2.05, 3.05
for x, (nm, role, email, ini, accent, tint) in zip(xs, members):
    shape(s1, MSO_SHAPE.ROUNDED_RECTANGLE, x, cy, cw, chh, tint, accent, 1.5, radius=0.07)
    ad = 1.16
    av = shape(s1, MSO_SHAPE.OVAL, x + (cw - ad) / 2, cy + 0.34, ad, ad, accent)
    lines_into(av.text_frame, [L(ini, 30, True, WHITE, PP_ALIGN.CENTER, 0)], _A.MIDDLE)
    box(s1, x + 0.08, cy + 1.66, cw - 0.16, 0.4,
        [L(nm, 14.5, True, INK, PP_ALIGN.CENTER, 0)], _A.TOP)
    box(s1, x + 0.08, cy + 2.04, cw - 0.16, 0.55,
        [L(role, 11, True, accent, PP_ALIGN.CENTER, 0)], _A.TOP)
    box(s1, x + 0.06, cy + 2.62, cw - 0.12, 0.34,
        [L(email, 9.5, False, MGRAY, PP_ALIGN.CENTER, 0)], _A.TOP)

# ===================================================================
# SLIDE 2 — Problem / Solution (graphical)
# ===================================================================
s2 = p.slides[2]
bodybox = find(s2, "Subtitle goes here")
if bodybox:
    remove_shape(bodybox)  # drop the prompt body; we draw our own

# --- LEFT: three pain cards ---
pains = [
    ("Velocity outruns enablement", "Engineering ships faster than sales can learn."),
    ("Shipped isn’t sellable", "The field can’t tell its value or which customer it fits."),
    ("Context goes cold", "Reconstructed weeks later by someone who didn’t build it."),
]
cy = 1.62
for i, (h, sub) in enumerate(pains):
    y = cy + i * 1.02
    card(s2, MSO_SHAPE.ROUNDED_RECTANGLE, 0.42, y, 5.62, 0.92, [], LGRAY, radius=0.14)
    num = shape(s2, MSO_SHAPE.OVAL, 0.62, y + 0.24, 0.44, 0.44, ORANGE)
    lines_into(num.text_frame, [L(str(i + 1), 16, True, WHITE, PP_ALIGN.CENTER, 0)], MSO_ANCHOR.MIDDLE)
    box(s2, 1.24, y + 0.13, 4.68, 0.7, [
        L(h, 15, True, INK, PP_ALIGN.LEFT, 2),
        L(sub, 11.5, False, MGRAY, PP_ALIGN.LEFT, 0),
    ], MSO_ANCHOR.MIDDLE)

# --- LEFT: gap bar chart ---
box(s2, 0.42, 4.84, 5.6, 0.34, [L("Shipping outruns enablement", 12, True, INK, PP_ALIGN.LEFT, 0)])
box(s2, 0.42, 5.24, 1.5, 0.3, [L("Shipped", 11, True, INK, PP_ALIGN.LEFT, 0)], MSO_ANCHOR.MIDDLE)
shape(s2, MSO_SHAPE.ROUNDED_RECTANGLE, 1.95, 5.24, 3.95, 0.3, ORANGE, radius=0.3)
box(s2, 0.42, 5.68, 1.5, 0.3, [L("Sellable", 11, True, INK, PP_ALIGN.LEFT, 0)], MSO_ANCHOR.MIDDLE)
shape(s2, MSO_SHAPE.ROUNDED_RECTANGLE, 1.95, 5.68, 1.25, 0.3, DGRAY, radius=0.3)
box(s2, 1.95, 6.06, 4.0, 0.32, [L("← the enablement gap the field feels", 11.5, True, ORANGE, PP_ALIGN.LEFT, 0)])

# --- RIGHT: intro + pipeline chevrons ---
box(s2, 6.19, 1.44, 6.55, 0.62, [
    L("Amplify runs as a pipeline stage right after deploy —", 12.5, True, INK, PP_ALIGN.LEFT, 1),
    L("enablement is now part of “done,” beside tests and docs.", 12, False, MGRAY, PP_ALIGN.LEFT, 0),
])
stages = [("Code", False), ("Build", False), ("Test", False), ("Deploy", False), ("Amplify", True)]
cw, ov, ch, sy, sx = 1.52, 0.30, 0.58, 2.18, 6.19
for i, (label, hot) in enumerate(stages):
    x = sx + i * (cw - ov)
    ch_shape = shape(s2, MSO_SHAPE.CHEVRON, x, sy, cw, ch,
                     ORANGE if hot else RGBColor(0xE6, 0xE6, 0xEC))
    lines_into(ch_shape.text_frame,
               [L(label, 11.5, hot, WHITE if hot else INK, PP_ALIGN.CENTER, 0)], MSO_ANCHOR.MIDDLE)

# --- RIGHT: output chips ---
adown = shape(s2, MSO_SHAPE.DOWN_ARROW, 9.05, 2.86, 0.34, 0.3, ORANGE)
card(s2, MSO_SHAPE.ROUNDED_RECTANGLE, 6.19, 3.22, 3.08, 0.72,
     [L("Enablement video", 12.5, True, INK, PP_ALIGN.CENTER, 1),
      L("~2 min · on-brand · narrated", 10, False, MGRAY, PP_ALIGN.CENTER, 0)],
     WHITE, ORANGE, radius=0.16)
card(s2, MSO_SHAPE.ROUNDED_RECTANGLE, 9.42, 3.22, 3.05, 0.72,
     [L("Matching one-pager", 12.5, True, INK, PP_ALIGN.CENTER, 1),
      L("same plan · second artifact", 10, False, MGRAY, PP_ALIGN.CENTER, 0)],
     WHITE, ORANGE, radius=0.16)

# --- RIGHT: trust strip ---
tstrip = card(s2, MSO_SHAPE.ROUNDED_RECTANGLE, 6.19, 4.22, 6.28, 0.72, [], LGRAY, radius=0.12,
              anchor=MSO_ANCHOR.MIDDLE)
lock = shape(s2, MSO_SHAPE.OVAL, 6.42, 4.42, 0.34, 0.34, ORANGE)
lines_into(lock.text_frame, [L("✓", 13, True, WHITE, PP_ALIGN.CENTER, 0)], MSO_ANCHOR.MIDDLE)
box(s2, 6.92, 4.3, 5.4, 0.6, [
    L("Capture, not publish.", 11.5, True, INK, PP_ALIGN.LEFT, 1),
    L("A human approves in Action Center before anything customer-facing ships.", 10.5, False, MGRAY, PP_ALIGN.LEFT, 0),
], MSO_ANCHOR.MIDDLE)

# --- RIGHT: why it stands out ---
box(s2, 6.19, 5.16, 6.3, 0.34, [L("Why Amplify stands out", 13, True, ORANGE, PP_ALIGN.LEFT, 0)])
standout = [
    "Grounded in PR + Jira — never invents a claim.",
    "Cinematic auto-zoom on real footage — not a static screen-dump.",
    "Fires at merge, while the engineer’s context is richest.",
]
for i, t in enumerate(standout):
    y = 5.55 + i * 0.4
    dot = shape(s2, MSO_SHAPE.OVAL, 6.22, y + 0.02, 0.2, 0.2, ORANGE)
    lines_into(dot.text_frame, [L("✓", 9, True, WHITE, PP_ALIGN.CENTER, 0)], MSO_ANCHOR.MIDDLE)
    box(s2, 6.54, y - 0.04, 5.9, 0.34, [L(t, 11.5, False, INK, PP_ALIGN.LEFT, 0)], MSO_ANCHOR.MIDDLE)

# ===================================================================
# SLIDE 3 — Benefits & Technologies (table kept, benefits → badge grid)
# ===================================================================
s3 = p.slides[3]
answers = [
    "Sales / GTM teams + the engineers who ship.",
    "Engineering & Sales (Go-to-Market).",
    "Agents SDK (coded agents), Orchestrator + Storage Buckets, Action Center (HITL), Integration Service, UiPath Apps; UiPath brand tokens.",
    "Claude, HyperFrames (HTML→MP4), TypeScript/Bun, headless Chrome + GSAP + FFmpeg, ElevenLabs + Whisper; GitHub / Jira / Slack / Confluence / YouTube connectors.",
]
tbl = next((sh.table for sh in s3.shapes if sh.has_table), None)
if tbl is not None:
    for ri, ans in enumerate(answers):
        cell = tbl.cell(ri, 1)
        cell.vertical_anchor = _A.TOP
        fill(cell.text_frame, [(ans, {})], size=10.5)

# replace the benefits prompt box with a badge grid
ben = find(s3, "Content Placeholder")
if ben:
    remove_shape(ben)
benefits = [
    ("Enablement at the source", "captured while context is hot"),
    ("Zero effort for engineers", "no editor, no designer"),
    ("Sell it on day one", "what shipped, where it fits, how"),
    ("Two artifacts, one plan", "~2-min video + one-pager"),
    ("Trust built in", "claim-check + human approval"),
    ("Scales with velocity", "every merge, amplified"),
]
bx = [6.19, 9.5]
by0, bw, bh, gap = 2.16, 3.12, 1.06, 0.16
for i, (h, sub) in enumerate(benefits):
    col, row = i % 2, i // 2
    x = bx[col]
    y = by0 + row * (bh + gap)
    sp = card(s3, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, bw, bh, [], LGRAY, radius=0.1,
              anchor=_A.MIDDLE)
    shape(s3, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, 0.11, bh, ORANGE, radius=0.5)
    box(s3, x + 0.26, y + 0.16, bw - 0.4, 0.78, [
        L(h, 13, True, INK, PP_ALIGN.LEFT, 2),
        L(sub, 10, False, MGRAY, PP_ALIGN.LEFT, 0),
    ], _A.MIDDLE)

# ===================================================================
# NEW SLIDE — "How Amplify works": INPUT → AMPLIFY → OUTPUT
# ===================================================================
lay_white = next(l for l in p.slide_layouts if l.name == "Headline Only-white")
sw = p.slides.add_slide(lay_white)
title_ph = next((x for x in sw.placeholders if x.placeholder_format.idx == 0), None)
if title_ph is not None:
    fill(title_ph.text_frame, [("How Amplify works.", {})])
box(sw, 0.42, 1.32, 12.4, 0.42, [
    L("One merge in — a narrated, on-brand video and a matching one-pager out. Automatically.",
      13, False, MGRAY, PP_ALIGN.LEFT, 0)])


def io_card(slide, x, y, w, h, title, sub):
    card(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h, [], LGRAY, radius=0.12, anchor=_A.MIDDLE)
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, 0.11, h, ORANGE, radius=0.5)
    box(slide, x + 0.26, y + 0.14, w - 0.42, h - 0.24, [
        L(title, 13.5, True, INK, PP_ALIGN.LEFT, 2),
        L(sub, 10, False, MGRAY, PP_ALIGN.LEFT, 0),
    ], _A.MIDDLE)


# INPUT column
box(sw, 0.42, 2.02, 2.75, 0.5, [
    L("INPUT", 12, True, ORANGE, PP_ALIGN.LEFT, 1),
    L("when a feature merges", 10, False, MGRAY, PP_ALIGN.LEFT, 0)])
io_card(sw, 0.42, 2.62, 2.75, 1.0, "Pull request", "diff · commits")
io_card(sw, 0.42, 3.72, 2.75, 1.0, "Jira ticket", "customer ask · criteria")
box(sw, 0.42, 4.85, 2.75, 0.8, [
    L("captured while the builder’s context is richest — and most perishable.",
      10, False, MGRAY, PP_ALIGN.LEFT, 0)])

# arrows
shape(sw, MSO_SHAPE.RIGHT_ARROW, 3.24, 3.92, 0.58, 0.34, ORANGE)
shape(sw, MSO_SHAPE.RIGHT_ARROW, 9.52, 3.92, 0.58, 0.34, ORANGE)

# AMPLIFY engine panel
px, pw, py, ph_ = 3.88, 5.58, 1.95, 4.72
shape(sw, MSO_SHAPE.ROUNDED_RECTANGLE, px, py, pw, ph_, RGBColor(0xFB, 0xF3, 0xF0), ORANGE, 1.25, radius=0.05)
box(sw, px, py + 0.14, pw, 0.72, [
    L("AMPLIFY", 16, True, ORANGE, PP_ALIGN.CENTER, 1),
    L("runs automatically — no editor, no designer", 10.5, False, MGRAY, PP_ALIGN.CENTER, 0)],
    _A.TOP)
steps = [
    ("Content director", "reads the PR + Jira → writes the story and the sales positioning. Grounded — never invents a claim."),
    ("Camera director", "reuses the engineer’s demo recording and guides the eye with cinematic auto-zoom."),
    ("Studio assembly", "bespoke on-brand scenes + expressive voiceover + music, SFX and captions."),
    ("Trust gate", "claim-check flags unsupported lines; a human approves in Action Center before publish."),
]
scy = py + 0.92
for i, (h, sub) in enumerate(steps):
    y = scy + i * 0.90
    num = shape(sw, MSO_SHAPE.OVAL, px + 0.22, y + 0.16, 0.42, 0.42, ORANGE)
    lines_into(num.text_frame, [L(str(i + 1), 15, True, WHITE, PP_ALIGN.CENTER, 0)], _A.MIDDLE)
    box(sw, px + 0.78, y + 0.05, pw - 1.0, 0.78, [
        L(h, 12.5, True, INK, PP_ALIGN.LEFT, 1),
        L(sub, 9.8, False, MGRAY, PP_ALIGN.LEFT, 0),
    ], _A.MIDDLE)

# OUTPUT column
box(sw, 10.15, 2.02, 2.8, 0.5, [
    L("OUTPUT", 12, True, ORANGE, PP_ALIGN.LEFT, 1),
    L("two artifacts, one plan", 10, False, MGRAY, PP_ALIGN.LEFT, 0)])
io_card(sw, 10.15, 2.62, 2.8, 1.0, "Enablement video", "~2 min · narrated")
io_card(sw, 10.15, 3.72, 2.8, 1.0, "One-pager", "same plan · for sales")
box(sw, 10.15, 4.85, 2.8, 0.8, [
    L("→ published to YouTube, Slack & Confluence", 10.5, True, ORANGE, PP_ALIGN.LEFT, 0)])

# --- move the new slide into position 3 (after Problem/Solution) ---
sldIdLst = p.slides._sldIdLst
ids = list(sldIdLst)          # 0 title, 1 team, 2 problem, 3 benefits, 4 how-it-works
howto = ids[4]
sldIdLst.remove(howto)
sldIdLst.insert(3, howto)     # -> title, team, problem, how-it-works, benefits

# --- fix hardcoded page numbers on the Benefits slide (now slide 5) ---
for sh in p.slides[4].shapes:
    if sh.has_text_frame and sh.name.startswith("Slide Number"):
        fill(sh.text_frame, [("5", {})])

p.save("Amplify.pptx")
print("saved Amplify.pptx  slides:", len(p.slides._sldIdLst))
