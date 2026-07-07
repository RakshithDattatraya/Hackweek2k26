/**
 * Dogfood build (cinematic pass): enablement video ABOUT the Feature→Enablement Video Pipeline.
 * Real pipeline infra: loadBrandTokens · synthesizePlanAudio (VO-driven timing) · render.
 * Motion: dissolve transitions, push-in, auto-zoom into the Slack punchline, logo intro sting.
 * Run: export HYPERFRAMES_NODE_BIN=".../v24.14.1/bin"; bun run demo/build-video.ts
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadBrandTokens } from "../src/brand/token-resolver";
import { saySynthesizer } from "../src/audio/tts";
import { synthesizePlanAudio } from "../src/audio/assemble-audio";
import { render } from "../src/render/render";

const OUT = join(process.cwd(), "out/feature-video");
const t = loadBrandTokens();
const PANEL = "#1e2c35", HAIR = "#33434d", MUTED = "#93a0a8", SUB = "#c4ccd2";
const GLOW =
  "radial-gradient(1150px 780px at 12% 6%, rgba(250,70,22,.10), transparent 58%)," +
  "radial-gradient(1050px 720px at 90% 96%, rgba(11,162,179,.13), transparent 58%)";
const bg = (base: string) => `${GLOW}, ${base}`;

type Push = { scale: number; y: number; ease: string };
type Scene = { id: string; type: "hook" | "capability" | "demo" | "positioning" | "cta"; narration: string; bg: string; stagger?: number; center?: boolean; push?: Push; body: string };

const sbChannel = (name: string, active = false) => `<div class="sb-ch${active ? " active" : ""}"><span class="sb-hash">#</span>${name}</div>`;
const msg = (color: string, initials: string, name: string, time: string, text: string) => `
  <div class="anim srow"><div class="savatar" style="background:${color}">${initials}</div>
    <div class="scol"><div class="shead"><span class="sname">${name}</span><span class="stime">${time}</span></div>
      <div class="stext">${text}</div></div></div>`;

const scenes: Scene[] = [
  {
    id: "intro", type: "hook", bg: bg(t.deepBlue), center: true, push: { scale: 1.06, y: 0, ease: "power2.out" }, stagger: 0.5,
    narration: "UiPath enablement.",
    body: `<img class="anim logo big" src="assets/uipath-logo-orange.png" alt="UiPath" />
      <div class="anim introtag">Enablement<span style="color:${t.orange}">.</span> Automatically.</div>`,
  },
  {
    id: "slack", type: "hook", bg: bg(t.deepBlue), stagger: 0.8, push: { scale: 1.14, y: -32, ease: "power2.inOut" },
    narration: "It always starts the same way. Engineering ships something great. And over in sales, the questions start pouring in.",
    body: `<div class="slackwin">
        <div class="slack-sb"><div class="sb-ws">UiPath <span class="sb-caret">⌄</span></div>
          <div class="sb-sec">Channels</div>${sbChannel("general")}${sbChannel("product-updates")}${sbChannel("sales-help", true)}${sbChannel("customer-wins")}</div>
        <div class="slack-main"><div class="slack-hd"><span class="hd-ch"># sales-help</span><span class="hd-meta">&nbsp;&nbsp;12 members</span></div>
          <div class="slack-body">
            ${msg("#E01E5A", "PS", "Priya Sharma", "9:41 AM", "wait… we shipped a new agentic feature this sprint?? 😅")}
            ${msg("#2EB67D", "MA", "Marco Alvarez", "9:42 AM", "a customer literally asked about it on my call today. I had <b>nothing</b>")}
            ${msg("#36C5F0", "DV", "Devansh Verma", "9:43 AM", "eng merged it like 3 weeks ago. no demo, no deck, no talk track 🫠")}
            ${msg("#E01E5A", "PS", "Priya Sharma", "9:44 AM", "how am I supposed to sell what I can't even explain")}
          </div><div class="slack-compose"><span>Message #sales-help</span></div></div></div>`,
  },
  {
    id: "gap", type: "hook", bg: bg("#0f1417"), stagger: 0.32,
    narration: "This is the engineering to enablement gap. Features ship — but the people who sell them are the last to know.",
    body: `<div class="eyebrow anim" style="color:${t.orange}"><i></i>The problem</div>
      <h1 class="anim" style="margin-bottom:64px">The engineering <span style="color:${MUTED}">→</span> enablement gap.</h1>
      <div class="gapviz">
        <div class="shore anim" style="border-color:${t.teal}"><div class="shore-icon" style="background:rgba(11,162,179,.15);color:${t.teal}">✓</div>
          <div class="shore-t">Engineering</div><div class="shore-s">Feature merged. Full context — what shipped and why.</div></div>
        <div class="chasm anim"><div class="chasm-dot" style="background:${t.orange}"></div><div class="chasm-line"></div>
          <div class="chasm-lbl">weeks pass · context evaporates</div></div>
        <div class="shore anim" style="border-color:${t.orange}"><div class="shore-icon" style="background:rgba(250,70,22,.15);color:${t.orange}">?</div>
          <div class="shore-t">Sales</div><div class="shore-s">Last to know. Can't articulate it, can't demo it.</div></div></div>`,
  },
  {
    id: "insight", type: "capability", bg: bg(t.deepBlue),
    narration: "But here's the key insight. The moment a pull request merges is when the engineer has maximum context about what was built — and why.",
    body: `<div class="eyebrow anim" style="color:${t.teal}"><i style="background:${t.teal}"></i>The insight</div>
      <h1 class="anim">Merge is the moment of <span style="color:${t.teal}">maximum context.</span></h1>
      <p class="sub anim">Capture the "what" and the "why" the instant it's freshest — before it evaporates into the next ticket.</p>`,
  },
  {
    id: "solution", type: "capability", bg: bg(t.deepBlue),
    narration: "So we built it. The Feature to Enablement Video Pipeline. When a feature merges, it automatically drafts a premium enablement video — and a one-pager.",
    body: `<img class="anim logo" src="assets/uipath-logo-orange.png" alt="UiPath" />
      <h1 class="anim" style="margin-top:30px">Feature <span style="color:${t.orange}">→</span> Enablement Video Pipeline</h1>
      <p class="sub anim">On merge: a draft video + one-pager — good enough for sales to understand, and to show a customer.</p>`,
  },
  {
    id: "how", type: "demo", bg: bg(t.deepBlue), stagger: 0.4,
    narration: "It works like an assembly line. A pull request, a Jira ticket, or a simple prompt flows through a content director, gets skinned in UiPath brand, narrated, and rendered — automatically.",
    body: `<div class="eyebrow anim" style="color:${t.teal};align-self:flex-start"><i style="background:${t.teal}"></i>How it works</div>
      <div class="flow">${[["PR · Jira · Prompt", "📥"], ["Content Director", "🎬"], ["Brand Tokens", "🎨"], ["Voiceover", "🎙️"], ["Render", "⚙️"], ["Draft", "✅"]]
        .map(([n, ic], i, a) => `<div class="node anim"><span class="node-ic">${ic}</span>${n}</div>${i < a.length - 1 ? `<div class="arrow anim">→</div>` : ""}`).join("")}</div>`,
  },
  {
    id: "tech", type: "demo", bg: bg(t.deepBlue), stagger: 0.26,
    narration: "Under the hood: two AI directors — one for the story, one for the camera. A UiPath design-token layer keeps every frame on-brand. And the voiceover drives the scene timing automatically.",
    body: `<div class="eyebrow anim" style="color:${t.teal};align-self:flex-start"><i style="background:${t.teal}"></i>Technical capabilities</div>
      <ul class="caps">${[["🎬", "Two AI directors", "content (the story) + camera (where the eye goes)"], ["🎨", "UiPath design-token layer", "one source of truth — every frame on-brand"], ["🎙️", "Voiceover-driven timing", "scene durations follow the narration, automatically"], ["⚙️", "HyperFrames renderer", "deterministic HTML → MP4, no per-render fees"], ["📥", "Multi-source ingest", "PR · Jira ticket · plain prompt"]]
        .map(([ic, h, d]) => `<li class="anim"><span class="capic">${ic}</span><span class="captx"><b>${h}</b><span class="capd">${d}</span></span></li>`).join("")}</ul>`,
  },
  {
    id: "hitl", type: "positioning", bg: bg(t.deepBlue), stagger: 0.45,
    narration: "But it never ships on its own. A merge triggers capture — not publish. Every video is a draft, routed to a human before anything reaches a customer. One bad auto-video kills trust, so a person always signs off.",
    body: `<div class="eyebrow anim" style="color:${t.orange};align-self:flex-start"><i></i>Human in the loop</div>
      <h2 class="anim" style="margin:0 0 48px">Merge triggers <span style="color:${t.orange}">capture</span> — not publish.</h2>
      <div class="flow"><div class="node anim"><span class="node-ic">🔀</span>Merge</div><div class="arrow anim">→</div>
        <div class="node anim"><span class="node-ic">🎬</span>Draft</div><div class="arrow anim">→</div>
        <div class="node gate anim"><span class="node-ic">👤</span>Human review</div><div class="arrow anim">→</div>
        <div class="node ok anim"><span class="node-ic">✅</span>Publish</div></div>
      <p class="sub anim" style="margin-top:44px">The approval gate is the trust mechanism — nothing customer-facing ships unreviewed.</p>`,
  },
  {
    id: "cta", type: "cta", bg: bg(t.deepBlue), center: true, stagger: 0.4, push: { scale: 1.05, y: 0, ease: "power2.out" },
    narration: "From merge to enablement — automatically, and on brand. That's the pipeline.",
    body: `<div class="ctacard anim"><img class="logo" src="assets/uipath-logo-orange.png" alt="UiPath" /></div>
      <h1 class="anim" style="margin-top:48px;text-align:center">From merge to enablement.<br/><span style="color:${t.orange}">Automatically.</span></h1>`,
  },
];
const DEFAULT_PUSH: Push = { scale: 1.03, y: 0, ease: "none" };

mkdirSync(join(OUT, "audio"), { recursive: true });
const planForAudio = { feature_name: "x", value_prop: "", persona: "", when_to_use: "", talking_points: ["x"],
  scenes: scenes.map((s) => ({ id: s.id, type: s.type, duration: 4, on_screen_text: "", narration: s.narration, asset_requirements: [] })),
  youtube_metadata: { title: "", description: "", tags: [], chapters: [] } } as any;
// Premium voice via the SpeechSynthesizer swap-seam (no change to committed pipeline code).
const avaSynthesizer = {
  synthesize(text: string, outWavPath: string) {
    const aiff = outWavPath.replace(/\.wav$/, ".aiff");
    execFileSync("say", ["-v", "Ava (Premium)", "-o", aiff, text]);
    execFileSync("ffmpeg", ["-y", "-i", aiff, "-ar", "44100", "-ac", "2", outWavPath], { stdio: "ignore" });
  },
};
console.log("Synthesizing voiceover (Ava Premium) for", scenes.length, "scenes…");
const { planWithTiming } = synthesizePlanAudio(planForAudio, avaSynthesizer, join(OUT, "audio"), 0.9);
const durations: Record<string, number> = {};
for (const s of planWithTiming.scenes) durations[s.id] = s.duration;
console.log("Normalizing voiceover to -16 LUFS…");
execFileSync("ffmpeg", ["-y", "-i", join(OUT, "audio/vo.wav"), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", join(OUT, "audio/vo-norm.wav")], { stdio: "ignore" });

// ---------- captions (transcribe VO → word-level cues) ----------
console.log("Transcribing for kinetic captions…");
const nodeBin = process.env.HYPERFRAMES_NODE_BIN;
const hfEnv = nodeBin ? { ...process.env, PATH: `${nodeBin}:${process.env.PATH}` } : process.env;
execFileSync("npx", ["-y", "hyperframes@latest", "transcribe", "audio/vo-norm.wav", "--json"], { cwd: OUT, env: hfEnv, stdio: "ignore" });
type Word = { text: string; start: number; end: number };
const words = JSON.parse(readFileSync(join(OUT, "audio/transcript.json"), "utf8")) as Word[];
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
const cues: { words: Word[]; start: number; end: number }[] = [];
{ let cur: Word[] = [], len = 0;
  const flush = () => { if (cur.length) { cues.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; } };
  for (const w of words) { cur.push(w); len += w.text.length + 1; if (len >= 42 || cur.length >= 8 || /[.?!]$/.test(w.text.trim())) { flush(); len = 0; } }
  flush(); }
const captionHtml = cues.map((c) => `    <div class="cap" data-s="${c.start}" data-e="${c.end}">${c.words.map((w) => `<span class="capw" data-t="${w.start}">${esc(w.text)}</span>`).join(" ")}</div>`).join("\n");

let cursor = 0;
const meta = scenes.map((s) => { const dur = durations[s.id] ?? 4; const start = cursor; cursor += dur; return { s, start, dur }; });
const total = cursor;
const clips = meta.map(({ s, start, dur }) => {
  const p = s.push ?? DEFAULT_PUSH;
  return `    <div class="clip scene${s.center ? " center" : ""}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="0" data-stagger="${s.stagger ?? 0.14}" data-ps="${p.scale}" data-py="${p.y}" data-pe="${p.ease}" style="background:${s.bg}">
      <div class="inner">${s.body}</div>
    </div>`;
}).join("\n");

const html = `<!doctype html>
<html lang="en" data-resolution="landscape">
<head>
<meta charset="UTF-8" />
<title>Feature → Enablement Video Pipeline</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
  html,body{margin:0;padding:0;width:1920px;height:1080px;overflow:hidden;background:${t.deepBlue};font-family:'Inter',sans-serif;color:${t.white};-webkit-font-smoothing:antialiased;}
  #master-root{width:1920px;height:1080px;position:relative;}
  .scene{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;will-change:transform,opacity;}
  .inner{width:1520px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;transform-origin:center center;}
  .scene.center .inner{align-items:center;text-align:center;}
  .eyebrow{font-family:'Inter';font-weight:700;text-transform:uppercase;letter-spacing:.2em;font-size:24px;margin-bottom:28px;display:flex;align-items:center;gap:14px;}
  .eyebrow i{display:inline-block;width:34px;height:4px;border-radius:2px;background:${t.orange};}
  h1{font-family:'Poppins';font-weight:700;font-size:94px;line-height:1.04;letter-spacing:-0.045em;margin:0;}
  h2{font-family:'Poppins';font-weight:700;font-size:70px;line-height:1.05;letter-spacing:-0.04em;margin:0;}
  .sub{font-family:'Inter';font-weight:400;font-size:33px;line-height:1.42;color:${SUB};margin:34px 0 0;max-width:1240px;}
  .logo{height:120px;width:auto;align-self:flex-start;flex:0 0 auto;}
  .scene.center .logo{align-self:center;}
  .logo.big{height:180px;}
  .introtag{font-family:'Poppins';font-weight:600;font-size:46px;letter-spacing:-0.02em;color:${SUB};margin-top:34px;}
  .footer{position:absolute;left:64px;bottom:48px;font-family:'Inter';font-weight:600;font-size:22px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.28);display:flex;align-items:center;gap:12px;}
  .footer b{color:rgba(255,255,255,.5);font-weight:700;}
  .slackwin{width:1240px;height:660px;display:flex;border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 50px 110px rgba(0,0,0,.55);border:1px solid rgba(0,0,0,.1);}
  .slack-sb{width:290px;background:#3F0E40;color:#fff;padding:22px 0;flex:0 0 auto;}
  .sb-ws{font-family:'Poppins';font-weight:700;font-size:27px;padding:4px 22px 20px;border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:16px;display:flex;align-items:center;gap:8px;}
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
  .gapviz{display:flex;align-items:stretch;gap:0;width:100%;}
  .shore{flex:1;background:${PANEL};border:2px solid ${HAIR};border-top-width:5px;border-radius:18px;padding:40px 40px 44px;text-align:left;}
  .shore-icon{width:74px;height:74px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:700;margin-bottom:26px;}
  .shore-t{font-family:'Poppins';font-weight:700;font-size:42px;margin-bottom:12px;}.shore-s{font-size:28px;color:${SUB};line-height:1.4;}
  .chasm{flex:0 0 340px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;}
  .chasm-line{width:100%;height:0;border-top:4px dashed ${MUTED};opacity:.5;}
  .chasm-dot{width:16px;height:16px;border-radius:50%;position:absolute;top:calc(50% - 8px);left:calc(50% - 8px);box-shadow:0 0 24px 6px rgba(250,70,22,.5);}
  .chasm-lbl{position:absolute;top:calc(50% + 24px);left:50%;transform:translateX(-50%);width:250px;text-align:center;font-size:19px;line-height:1.35;color:${MUTED};text-transform:uppercase;letter-spacing:.07em;}
  .flow{display:flex;align-items:center;flex-wrap:wrap;gap:20px;margin-top:14px;}
  .node{background:${PANEL};border:2px solid ${HAIR};border-radius:16px;padding:26px 30px;font-family:'Poppins';font-weight:600;font-size:32px;color:#eef2f4;white-space:nowrap;display:flex;align-items:center;gap:14px;}
  .node-ic{font-size:34px;}.node.gate{background:#2a1f18;border-color:${t.orange};}.node.ok{border-color:${t.teal};}
  .arrow{font-size:42px;color:${MUTED};}
  .caps{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:28px;width:100%;}
  .caps li{display:flex;gap:26px;align-items:center;font-size:37px;}
  .capic{flex:0 0 76px;width:76px;height:76px;border-radius:16px;background:${PANEL};border:1px solid ${HAIR};display:flex;align-items:center;justify-content:center;font-size:38px;}
  .caps b{font-family:'Poppins';font-weight:600;display:block;}.capd{display:block;font-size:27px;color:#aab4bb;margin-top:5px;}
  .ctacard{background:#fff;border-radius:26px;padding:52px 68px;box-shadow:0 34px 90px rgba(0,0,0,.45);}.ctacard .logo{height:92px;align-self:center;}
  .cap{position:absolute;left:50%;bottom:70px;transform:translateX(-50%);width:1200px;text-align:center;font-family:'Inter';font-weight:600;font-size:37px;line-height:1.3;text-shadow:0 2px 22px rgba(0,0,0,.75);pointer-events:none;z-index:50;}
  .capw{color:rgba(255,255,255,.4);}
</style>
</head>
<body>
  <div id="master-root" data-composition-id="feature-video" data-start="0" data-width="1920" data-height="1080">
${clips}
${captionHtml}
    <div class="footer"><b>UiPath</b> · Enablement</div>
    <audio id="vo" src="audio/vo-norm.wav" data-start="0" data-duration="${total.toFixed(2)}" data-track-index="1"></audio>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    const scenes = [...document.querySelectorAll('.scene')];
    scenes.forEach((scene) => {
      const start = parseFloat(scene.dataset.start);
      const dur = parseFloat(scene.dataset.duration);
      const stagger = parseFloat(scene.dataset.stagger) || 0.14;
      const inner = scene.querySelector('.inner');
      // camera push-in / auto-zoom across the scene's visible window (class="clip" controls visibility)
      tl.fromTo(inner, { scale: 1, y: 0 }, { scale: parseFloat(scene.dataset.ps), y: parseFloat(scene.dataset.py), duration: dur, ease: scene.dataset.pe || 'none' }, start);
      // staggered content entrance
      const kids = scene.querySelectorAll('.anim');
      if (kids.length) tl.from(kids, { autoAlpha: 0, y: 44, duration: 0.6, stagger: stagger, ease: 'back.out(1.6)' }, start + 0.28);
    });
    // kinetic captions: fade each cue in/out, brighten each word as it's spoken
    document.querySelectorAll('.cap').forEach((cap) => {
      const s = parseFloat(cap.dataset.s), e = parseFloat(cap.dataset.e);
      tl.fromTo(cap, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.22, ease: 'power2.out' }, Math.max(0, s - 0.08));
      tl.to(cap, { autoAlpha: 0, duration: 0.2, ease: 'power1.in' }, e + 0.18);
      cap.querySelectorAll('.capw').forEach((w) => { tl.to(w, { color: '#ffffff', duration: 0.12 }, parseFloat(w.dataset.t)); });
    });
    window.__timelines["feature-video"] = tl;
  </script>
</body>
</html>`;

writeFileSync(join(OUT, "index.html"), html);
writeFileSync(join(OUT, "meta.json"), JSON.stringify({ id: "feature-video", name: "Feature to Enablement Video Pipeline", duration: total, width: 1920, height: 1080, fps: 30 }, null, 2));
console.log(`Composition written. Total ${total.toFixed(1)}s across ${scenes.length} scenes.`);
console.log("Rendering with HyperFrames…");
render(OUT, "renders/feature-video.mp4");
if (!existsSync(join(OUT, "renders/feature-video.mp4"))) throw new Error("render produced no file");
console.log("Done →", join(OUT, "renders/feature-video.mp4"));
