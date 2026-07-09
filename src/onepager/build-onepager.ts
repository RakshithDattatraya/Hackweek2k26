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
    const d = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path]).toString().trim());
    return Number.isFinite(d) ? d : 0;  // unparseable ffprobe output → 0 (not NaN)
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
