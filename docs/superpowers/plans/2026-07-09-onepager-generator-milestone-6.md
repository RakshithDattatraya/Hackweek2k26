# One-Pager Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** From the same VideoPlan the video uses, generate a branded single-page enablement one-pager (HTML + best-effort PDF) with a hero still pulled from the rendered video.

**Architecture:** `src/onepager/` — a pure HTML builder, an ffmpeg still-extractor, a headless-Chrome PDF converter, and an orchestrator + CLI. A non-fatal hook in `build-plan.ts` emits the one-pager alongside the video.

**Tech Stack:** TypeScript, bun, ffmpeg/ffprobe, a system Chrome (optional — HTML always emits). No new npm deps.

## Global Constraints

- No new npm dependencies; ffmpeg + optional system Chrome only.
- Reuse `escapeHtml` from `src/compose/scene-card.ts`; never inject unescaped plan text.
- Ground all copy in the VideoPlan (no invented claims).
- Brand tokens (`BrandTokens`: `.orange`, `.teal`, `.deepBlue`, `.white`, `.fontHeadline`, `.fontBody`) are the single source of color truth.
- PDF is best-effort: no Chrome → return false, still write HTML; a one-pager failure must never fail the video build.

---

### Task 1: One-pager HTML builder (`src/onepager/render-html.ts`)

**Files:**
- Create: `src/onepager/render-html.ts`
- Test: `src/onepager/render-html.test.ts`

**Interfaces:**
- Produces: `renderOnePagerHtml(plan: VideoPlanV3, t: BrandTokens, opts?: { heroDataUri?: string; videoUrl?: string; docsUrl?: string; logoRelPath?: string }): string`
- Consumes: `escapeHtml` from `../compose/scene-card`.

- [ ] **Step 1: Write the failing test** — `src/onepager/render-html.test.ts`:

```ts
import { test, expect } from "bun:test";
import { renderOnePagerHtml } from "./render-html";

const t: any = { orange: "#010203", teal: "#040506", deepBlue: "#070809", white: "#0a0b0c", fontHeadline: "Poppins", fontBody: "Inter" };
const plan: any = {
  feature_name: "Autopilot Guardrails",
  value_prop: "Ship agent actions safely.",
  persona: "Sales Engineering",
  when_to_use: "When a customer worries about agent safety.",
  talking_points: ["Leads with trust", "Answers the compliance objection"],
  scenes: [], youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
};

test("renders all plan content", () => {
  const h = renderOnePagerHtml(plan, t);
  expect(h).toContain("Autopilot Guardrails");
  expect(h).toContain("Ship agent actions safely.");
  expect(h).toContain("Sales Engineering");
  expect(h).toContain("When a customer worries about agent safety.");
  expect(h).toContain("Leads with trust");
  expect(h).toContain("Answers the compliance objection");
});

test("uses brand token colors", () => {
  const h = renderOnePagerHtml(plan, t);
  expect(h).toContain("#010203"); // orange
  expect(h).toContain("#040506"); // teal
  expect(h).toContain("#070809"); // deep blue
});

test("escapes injected plan text", () => {
  const h = renderOnePagerHtml({ ...plan, feature_name: "<script>x</script>" }, t);
  expect(h).not.toContain("<script>x</script>");
  expect(h).toContain("&lt;script&gt;");
});

test("hero block: omitted without data uri, present with it", () => {
  expect(renderOnePagerHtml(plan, t)).not.toContain('<img src="data:image/png');
  const h = renderOnePagerHtml(plan, t, { heroDataUri: "data:image/png;base64,AAAA", videoUrl: "https://x/v" });
  expect(h).toContain('<img src="data:image/png;base64,AAAA"');
  expect(h).toContain("https://x/v");
});
```

- [ ] **Step 2: Run to verify fail** — `bun test src/onepager/render-html.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/onepager/render-html.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify pass** — `bun test src/onepager/render-html.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/onepager/render-html.ts src/onepager/render-html.test.ts
git commit -m "feat: one-pager HTML builder (branded, print-optimized, plan-grounded)"
```

---

### Task 2: Hero still extractor (`src/onepager/hero-still.ts`)

**Files:**
- Create: `src/onepager/hero-still.ts`
- Test: `src/onepager/hero-still.test.ts`

**Interfaces:**
- Produces: `extractHeroStill(videoPath: string, atSec: number, outPngPath: string): void`, `pngToDataUri(pngPath: string): string`

- [ ] **Step 1: Write the failing test** — `src/onepager/hero-still.test.ts`:

```ts
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractHeroStill, pngToDataUri } from "./hero-still";

test("extractHeroStill writes a PNG and pngToDataUri encodes it", () => {
  const dir = join(process.cwd(), "out/test-hero"); mkdirSync(dir, { recursive: true });
  const vid = join(dir, "v.mp4"), png = join(dir, "h.png");
  execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10", "-t", "2", "-pix_fmt", "yuv420p", vid], { stdio: "ignore" });
  extractHeroStill(vid, 1, png);
  expect(statSync(png).size).toBeGreaterThan(1000);
  const uri = pngToDataUri(png);
  expect(uri.startsWith("data:image/png;base64,")).toBe(true);
  expect(uri.length).toBeGreaterThan(100);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test src/onepager/hero-still.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/onepager/hero-still.ts`:

```ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Extract a single frame at atSec from videoPath to outPngPath (scaled to 1280 wide). Deterministic. */
export function extractHeroStill(videoPath: string, atSec: number, outPngPath: string): void {
  execFileSync("ffmpeg", ["-y", "-ss", String(atSec), "-i", videoPath, "-frames:v", "1", "-vf", "scale=1280:-1", outPngPath], { stdio: "ignore" });
}

/** Read a PNG file and return it as a data: URI (self-contained embedding). */
export function pngToDataUri(pngPath: string): string {
  return `data:image/png;base64,${readFileSync(pngPath).toString("base64")}`;
}
```

- [ ] **Step 4: Run to verify pass** — `bun test src/onepager/hero-still.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/onepager/hero-still.ts src/onepager/hero-still.test.ts
git commit -m "feat: one-pager hero-still extractor (ffmpeg frame -> data uri)"
```

---

### Task 3: HTML→PDF via headless Chrome (`src/onepager/to-pdf.ts`)

**Files:**
- Create: `src/onepager/to-pdf.ts`
- Test: `src/onepager/to-pdf.test.ts`

**Interfaces:**
- Produces: `resolveChrome(): string | null`, `htmlToPdf(htmlPath: string, pdfPath: string): boolean`
- Note: both `htmlPath` and `pdfPath` must be ABSOLUTE paths (callers pass absolute).

- [ ] **Step 1: Write the failing test** — `src/onepager/to-pdf.test.ts`:

```ts
import { test, expect } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveChrome, htmlToPdf } from "./to-pdf";

test("resolveChrome returns a string or null without throwing", () => {
  const c = resolveChrome();
  expect(c === null || typeof c === "string").toBe(true);
});

test("htmlToPdf: produces a PDF when Chrome is available, false otherwise", () => {
  const dir = resolve(join(process.cwd(), "out/test-pdf")); mkdirSync(dir, { recursive: true });
  const html = join(dir, "p.html"), pdf = join(dir, "p.pdf");
  writeFileSync(html, "<!doctype html><html><body><h1>Hello one-pager</h1></body></html>");
  const ok = htmlToPdf(html, pdf);
  if (resolveChrome()) {
    expect(ok).toBe(true);
    expect(existsSync(pdf)).toBe(true);
    expect(statSync(pdf).size).toBeGreaterThan(1000);
  } else {
    expect(ok).toBe(false);
  }
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test src/onepager/to-pdf.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/onepager/to-pdf.ts`:

```ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CANDIDATES = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];

/** Find a usable Chrome/Chromium binary: CHROME_PATH env, macOS default, then PATH. Null if none. */
export function resolveChrome(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  if (existsSync(MAC_CHROME)) return MAC_CHROME;
  for (const c of CANDIDATES) {
    try {
      const p = execFileSync("which", [c]).toString().trim();
      if (p && existsSync(p)) return p;
    } catch { /* not found */ }
  }
  return null;
}

/** Render htmlPath (absolute) to pdfPath (absolute) via headless Chrome. Returns false if no Chrome. */
export function htmlToPdf(htmlPath: string, pdfPath: string): boolean {
  const chrome = resolveChrome();
  if (!chrome) return false;
  execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-sandbox",
    "--virtual-time-budget=3000",
    `--print-to-pdf=${pdfPath}`, "--no-pdf-header-footer",
    `file://${htmlPath}`,
  ], { stdio: "ignore" });
  return true;
}
```

- [ ] **Step 4: Run to verify pass** — `bun test src/onepager/to-pdf.test.ts` → PASS (both branches handled).

- [ ] **Step 5: Commit**

```bash
git add src/onepager/to-pdf.ts src/onepager/to-pdf.test.ts
git commit -m "feat: one-pager HTML->PDF via headless Chrome (best-effort, graceful)"
```

---

### Task 4: Orchestrator + CLI + pipeline hook (`src/onepager/build-onepager.ts`)

**Files:**
- Create: `src/onepager/build-onepager.ts`
- Modify: `src/pipeline/build-plan.ts` (non-fatal one-pager hook after render)
- Test: `src/onepager/build-onepager.test.ts`

**Interfaces:**
- Consumes: `renderOnePagerHtml` (T1), `extractHeroStill`/`pngToDataUri` (T2), `htmlToPdf` (T3), `validatePlanV3`, `loadBrandTokens`.
- Produces: `buildOnePager(plan: VideoPlanV3, t: BrandTokens, outDir: string, opts?: { videoPath?: string; heroStillAtSec?: number; videoUrl?: string; docsUrl?: string; logoSrcPath?: string }): { htmlPath: string; pdfPath: string | null }`

- [ ] **Step 1: Write the failing test** — `src/onepager/build-onepager.test.ts`:

```ts
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildOnePager } from "./build-onepager";
import { resolveChrome } from "./to-pdf";

const t: any = { orange: "#FA4616", teal: "#0BA2B3", deepBlue: "#182126", white: "#FFFFFF", fontHeadline: "Poppins", fontBody: "Inter" };
const plan: any = {
  feature_name: "Test Feature", value_prop: "Value.", persona: "SE",
  when_to_use: "When X.", talking_points: ["Point A"],
  scenes: [], youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
};

test("buildOnePager writes HTML with an embedded hero still from the video", () => {
  const dir = join(process.cwd(), "out/test-onepager"); mkdirSync(dir, { recursive: true });
  const vid = join(dir, "v.mp4");
  execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=10", "-t", "2", "-pix_fmt", "yuv420p", vid], { stdio: "ignore" });
  const r = buildOnePager(plan, t, join(dir, "op"), { videoPath: vid });
  expect(existsSync(r.htmlPath)).toBe(true);
  const html = readFileSync(r.htmlPath, "utf8");
  expect(html).toContain("Test Feature");
  expect(html).toContain("data:image/png;base64,");
  // pdfPath is a path when Chrome exists, else null — must match resolveChrome availability
  if (resolveChrome()) { expect(r.pdfPath).not.toBeNull(); expect(existsSync(r.pdfPath!)).toBe(true); }
  else { expect(r.pdfPath).toBeNull(); }
  rmSync(dir, { recursive: true, force: true });
});

test("buildOnePager still emits HTML when no video is given (no hero block)", () => {
  const dir = join(process.cwd(), "out/test-onepager2"); mkdirSync(dir, { recursive: true });
  const r = buildOnePager(plan, t, join(dir, "op"), {});
  const html = readFileSync(r.htmlPath, "utf8");
  expect(html).toContain("Test Feature");
  expect(html).not.toContain("data:image/png;base64,");
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test src/onepager/build-onepager.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/onepager/build-onepager.ts`:

```ts
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { validatePlanV3, type VideoPlanV3 } from "../content-director/plan-schema";
import { loadBrandTokens, type BrandTokens } from "../brand/token-resolver";
import { renderOnePagerHtml } from "./render-html";
import { extractHeroStill, pngToDataUri } from "./hero-still";
import { htmlToPdf } from "./to-pdf";

function probeDuration(path: string): number {
  try {
    return parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path]).toString().trim());
  } catch { return 0; }
}

/** Build the one-pager (HTML always; PDF best-effort). Hero still pulled from opts.videoPath if present. */
export function buildOnePager(
  plan: VideoPlanV3, t: BrandTokens, outDir: string,
  opts: { videoPath?: string; heroStillAtSec?: number; videoUrl?: string; docsUrl?: string; logoSrcPath?: string } = {},
): { htmlPath: string; pdfPath: string | null } {
  outDir = resolve(outDir);
  mkdirSync(join(outDir, "assets"), { recursive: true });

  const logoSrc = opts.logoSrcPath ?? join(process.cwd(), "brand/logos/uipath-logo-orange.png");
  if (existsSync(logoSrc)) execFileSync("cp", [logoSrc, join(outDir, "assets/uipath-logo-orange.png")]);

  let heroDataUri: string | undefined;
  if (opts.videoPath && existsSync(opts.videoPath)) {
    try {
      const dur = probeDuration(opts.videoPath);
      const at = opts.heroStillAtSec ?? Math.min(8, Math.max(1, dur * 0.4));
      const png = join(outDir, "hero.png");
      extractHeroStill(opts.videoPath, at, png);
      heroDataUri = pngToDataUri(png);
    } catch { /* no still — page still renders */ }
  }

  const html = renderOnePagerHtml(plan, t, { heroDataUri, videoUrl: opts.videoUrl, docsUrl: opts.docsUrl });
  const htmlPath = join(outDir, "onepager.html");
  writeFileSync(htmlPath, html);

  const pdfCandidate = join(outDir, "onepager.pdf");
  const pdfPath = htmlToPdf(htmlPath, pdfCandidate) ? pdfCandidate : null;
  return { htmlPath, pdfPath };
}

if (import.meta.main) {
  const planPath = process.argv[2] || "demo/feature-video.v3.json";
  const videoPath = process.argv[3];
  const plan = validatePlanV3(JSON.parse(readFileSync(planPath, "utf8")));
  const t = loadBrandTokens();
  const r = buildOnePager(plan, t, join(process.cwd(), "out/onepager"), { videoPath });
  console.log("One-pager HTML:", r.htmlPath);
  console.log(r.pdfPath ? `One-pager PDF:  ${r.pdfPath}` : "PDF skipped (no Chrome found — set CHROME_PATH to enable).");
}
```

- [ ] **Step 4: Run to verify pass** — `bun test src/onepager/build-onepager.test.ts` → PASS (2 tests).

- [ ] **Step 5: Add the non-fatal pipeline hook.** In `src/pipeline/build-plan.ts`, add an import near the top:

```ts
import { buildOnePager } from "../onepager/build-onepager";
```

At the END of `buildFromPlan`, AFTER the QA gate writes `qa-report.json` and BEFORE the `return`, insert:

```ts
  // One-pager (same plan, second artifact). Non-fatal: never fail the video build.
  try {
    const op = buildOnePager(plan as any, tokens, join(outDir, "onepager"), { videoPath: join(outDir, "renders/video.mp4") });
    console.log(`One-pager: ${op.htmlPath}${op.pdfPath ? ` (+ ${op.pdfPath})` : " (PDF skipped — no Chrome)"}`);
  } catch (e: any) {
    console.warn("One-pager generation skipped:", e?.message);
  }
```

(`plan`, `tokens`, `outDir` are all in scope at the end of `buildFromPlan`.)

- [ ] **Step 6: Regression + e2e sanity.**

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use stable
bun test src/onepager/
# standalone one-pager against the already-rendered dogfood video:
bun run src/onepager/build-onepager.ts demo/feature-video.v3.json out/latest-v2/renders/video.mp4
ls -la out/onepager/onepager.html out/onepager/onepager.pdf 2>/dev/null
```
Expected: onepager tests pass; `out/onepager/onepager.html` exists; `onepager.pdf` exists if Chrome is available (else a clear "PDF skipped" message and no pdf file). Open the HTML to eyeball layout.

- [ ] **Step 7: Commit**

```bash
git add src/onepager/build-onepager.ts src/onepager/build-onepager.test.ts src/pipeline/build-plan.ts
git commit -m "feat: one-pager orchestrator + CLI + non-fatal pipeline hook"
```

---

## Self-Review

- **Spec coverage:** render-html (T1), hero-still (T2), to-pdf (T3), orchestrator+CLI+pipeline hook (T4). All spec sections covered.
- **Placeholders:** none — complete code in every step.
- **Type consistency:** `renderOnePagerHtml(plan, t, opts)`, `extractHeroStill(videoPath, atSec, out)`, `pngToDataUri(png)`, `htmlToPdf(html, pdf)`, `buildOnePager(plan, t, outDir, opts)` — signatures match across definitions and call sites. `heroDataUri` threaded T2→T1 via T4.
- **Graceful degradation:** no video → no hero block; no Chrome → `pdfPath: null`, HTML still written; pipeline hook try/caught so the video build never fails on a one-pager error.
- **Determinism/safety:** ffmpeg still is a fixed-time single frame; all plan text escaped via `escapeHtml`; brand tokens for colors.
